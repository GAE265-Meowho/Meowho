-- 退養接到領養管理（0014）資料庫測試。執行方式：node supabase/tests/run-pglite.mjs。
-- ⚠ 會寫入測試資料（結束時 rollback），**不要在正式 Supabase 專案執行**。
-- 固定角色：F 中途；A 領養人；S 自己的中途也是自己（測試資料的情況）。輔助函式與 0004 測試相同。

begin;
begin;

create temp table fx (code text primary key, id uuid not null, email text not null);
create temp table test_results (n serial, name text, status text, detail text);

create function pg_temp.u(p_code text) returns uuid language sql stable as $fn$
  select id from pg_temp.fx where code = p_code
$fn$;

create function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $fn$
  insert into pg_temp.test_results (name, status, detail)
  values (p_name, case when coalesce(p_ok, false) then 'PASS' else 'FAIL' end, case when coalesce(p_ok, false) then null else p_detail end)
$fn$;

create function pg_temp.run_as(p_code text, p_sql text) returns text language plpgsql as $fn$
declare v text; uid uuid; em text;
begin
  if p_code is not null then
    uid := pg_temp.u(p_code);
    select email into em from pg_temp.fx where code = p_code;
  end if;
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'email', em)::text end, true);
  execute format('set local role %I', case when uid is null then 'anon' else 'authenticated' end);
  begin
    execute p_sql into v;
  exception when others then
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    return 'ERROR: ' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  return coalesce(v, '');
end $fn$;

create function pg_temp.expect_err(p_name text, p_code text, p_actual text) returns void language sql as $fn$
  select pg_temp.check(p_name, p_actual like 'ERROR:%' || p_code || '%', p_actual)
$fn$;
create function pg_temp.expect_ok(p_name text, p_actual text) returns void language sql as $fn$
  select pg_temp.check(p_name, p_actual not like 'ERROR:%', p_actual)
$fn$;
create function pg_temp.expect_eq(p_name text, p_expected text, p_actual text) returns void language sql as $fn$
  select pg_temp.check(p_name, p_actual is not distinct from p_expected, '預期 ' || coalesce(p_expected, 'null') || '，實際 ' || coalesce(p_actual, 'null'))
$fn$;

insert into pg_temp.fx values
  ('F', '00000000-0000-0000-0000-000000000e01', 'f14@test.example'),
  ('A', '00000000-0000-0000-0000-000000000e02', 'a14@test.example'),
  ('S', '00000000-0000-0000-0000-000000000e03', 's14@test.example');
insert into auth.users (id, email) select id, email from pg_temp.fx;
insert into public.meow_profiles (id, email, display_name) select id, email, code || ' 本人' from pg_temp.fx;
insert into public.meow_households (id, owner_id, name, caretaker_type, city, district, default_visibility) values
  ('00000000-0000-0000-0000-000000000ed1', pg_temp.u('F'), '小晴的中途貓屋', 'personal_foster', '台中市', '北屯區', 'public'),
  ('00000000-0000-0000-0000-000000000ed2', pg_temp.u('S'), 'S 的中途', 'personal_foster', '台北市', '大安區', 'public'),
  ('00000000-0000-0000-0000-000000000ed3', pg_temp.u('S'), 'S 的家', 'cat_owner', '台北市', '大安區', 'private');
insert into public.meow_cats (id, household_id, name, sex, life_stage, status) values
  ('00000000-0000-0000-0000-000000000ee1', '00000000-0000-0000-0000-000000000ed1', '橘子', 'male', 'adult', 'adoptable'),
  ('00000000-0000-0000-0000-000000000ee2', '00000000-0000-0000-0000-000000000ed3', '自己的貓', 'female', 'adult', 'adoptable');
update public.meow_cats set status = 'own', origin_household_id = '00000000-0000-0000-0000-000000000ed2' where id = '00000000-0000-0000-0000-000000000ee2';

-- 走一次移轉：A 開串 → 中途提出 → A 接收
create temp table ids (k text primary key, v text);
insert into pg_temp.ids select 'T', pg_temp.run_as('A', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000ee1')::text$q$);
create function pg_temp.id(k text) returns text language sql stable as $fn$ select v from pg_temp.ids where ids.k = id.k $fn$;
insert into pg_temp.ids select 'X', pg_temp.run_as('F', format($q$select public.meow_offer_transfer('%s', '橘子')::text$q$, pg_temp.id('T')));
select pg_temp.run_as('A', format($q$select public.meow_accept_transfer('%s')::text$q$, pg_temp.id('X')));

-- ---------- 提出 ----------
insert into pg_temp.ids select 'R1', pg_temp.run_as('A', $q$select public.meow_request_cat_return('00000000-0000-0000-0000-000000000ee1', '要出國工作，沒辦法帶橘子去')::text$q$);
select pg_temp.expect_eq('RTN-01 退養請求接到領養人和中途的對話串', pg_temp.id('T'),
  pg_temp.run_as('A', format($q$select thread_id::text from public.meow_cat_returns where id = '%s'$q$, pg_temp.id('R1'))));
select pg_temp.expect_eq('RTN-02 對話裡先有系統事件，再有領養人寫的原因', 'system:提出了「橘子」的退養請求。|text:要出國工作，沒辦法帶橘子去',
  pg_temp.run_as('F', format($q$select string_agg(kind || ':' || body, '|' order by created_at) from (select * from public.meow_messages where thread_id = '%s' order by created_at desc limit 2) m$q$, pg_temp.id('T'))));
select pg_temp.expect_eq('RTN-03 中途收到通知，附原因、連到這一串', '「A 本人的家」想把「橘子」退回給你|原因：要出國工作，沒辦法帶橘子去|/me/adoptions?t=' || pg_temp.id('T'),
  pg_temp.run_as('F', $q$select title || '|' || body || '|' || link from public.meow_notifications where type = 'cat_return_request'$q$));
select pg_temp.expect_eq('RTN-04 對中途來說是未讀', 'true',
  pg_temp.run_as('F', format($q$select (last_message_at > coalesce(keeper_read_at, '-infinity'))::text from public.meow_threads where id = '%s'$q$, pg_temp.id('T'))));

-- ---------- 撤回 ----------
select pg_temp.expect_ok('RTN-10 領養人撤回',
  pg_temp.run_as('A', format($q$select public.meow_withdraw_cat_return('%s')::text$q$, pg_temp.id('R1'))));
select pg_temp.expect_eq('RTN-11 撤回留在對話裡', '1',
  pg_temp.run_as('F', $q$select count(*)::text from public.meow_messages where body = '撤回了退養請求。'$q$));

-- ---------- 不用退養 ----------
insert into pg_temp.ids select 'R2', pg_temp.run_as('A', $q$select public.meow_request_cat_return('00000000-0000-0000-0000-000000000ee1', '貓和新生兒處不來')::text$q$);
select pg_temp.expect_ok('RTN-20 中途認為不需要退養',
  pg_temp.run_as('F', format($q$select public.meow_resolve_cat_return('%s', false)::text$q$, pg_temp.id('R2'))));
select pg_temp.expect_eq('RTN-21 結果留在對話裡，領養人的通知連到這一串', '1|/me/adoptions?t=' || pg_temp.id('T'),
  pg_temp.run_as('A', $q$select (select count(*) from public.meow_messages where body = '中途認為不需要退養。')::text || '|' ||
    (select link from public.meow_notifications where type = 'cat_return_result')$q$));

-- ---------- 收回 ----------
insert into pg_temp.ids select 'R3', pg_temp.run_as('A', $q$select public.meow_request_cat_return('00000000-0000-0000-0000-000000000ee1', '真的沒辦法照顧了')::text$q$);
select pg_temp.expect_ok('RTN-30 中途收回',
  pg_temp.run_as('F', format($q$select public.meow_resolve_cat_return('%s', true)::text$q$, pg_temp.id('R3'))));
select pg_temp.expect_eq('RTN-31 貓回到中途重新等家，對話留下結果', 'adoptable|true|1',
  (select c.status || '|' || (c.household_id = '00000000-0000-0000-0000-000000000ed1') || '|' ||
     (select count(*) from public.meow_messages where body like '中途收回了「橘子」%')
     from public.meow_cats c where c.id = '00000000-0000-0000-0000-000000000ee1'));
select pg_temp.expect_ok('RTN-32 收回後雙方還能在同一串聊',
  pg_temp.run_as('A', format($q$select public.meow_send_message('%s', '謝謝你')::text$q$, pg_temp.id('T'))));

-- ---------- 自己的中途也是自己：不建對話串，仍可退養 ----------
select pg_temp.expect_ok('RTN-40 原中途是自己時也能提出（不建對話串）',
  pg_temp.run_as('S', $q$select public.meow_request_cat_return('00000000-0000-0000-0000-000000000ee2', '測試')::text$q$));
select pg_temp.expect_eq('RTN-41 沒有對話串，通知連到領養管理', 'null|/me/adoptions',
  pg_temp.run_as('S', $q$select coalesce((select thread_id::text from public.meow_cat_returns), 'null') || '|' ||
    (select link from public.meow_notifications where type = 'cat_return_request')$q$));
select pg_temp.expect_eq('RTN-90 內部輔助函式前端不能呼叫', 'false',
  has_function_privilege('authenticated', 'public.meow_return_thread(uuid,uuid,uuid)', 'execute')::text);

select status, name, detail from pg_temp.test_results order by n;

rollback;
