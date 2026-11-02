-- 領養申請通知（0010）資料庫測試。執行方式：node supabase/tests/run-pglite.mjs。
-- ⚠ 會寫入測試資料（結束時 rollback），**不要在正式 Supabase 專案執行**。
-- 固定角色：F 中途（喵戶長）；A 領養人。輔助函式與 0004 測試相同。

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
  ('F', '00000000-0000-0000-0000-000000000aa1', 'f10@test.example'),
  ('A', '00000000-0000-0000-0000-000000000ab1', 'a10@test.example');
insert into auth.users (id, email) select id, email from pg_temp.fx;
insert into public.meow_profiles (id, email) select id, email from pg_temp.fx;
insert into public.meow_households (id, owner_id, name, caretaker_type, city, district, default_visibility)
  values ('00000000-0000-0000-0000-000000000ad1', pg_temp.u('F'), '小晴的中途貓屋', 'personal_foster', '台中市', '北屯區', 'public');
insert into public.meow_cats (id, household_id, name, sex, life_stage, status, visibility)
  values ('00000000-0000-0000-0000-000000000ae1', '00000000-0000-0000-0000-000000000ad1', '橘子', 'male', 'adult', 'adoptable', 'public');
insert into public.meow_adoption_forms (id, cat_id, questions, is_open)
  values ('00000000-0000-0000-0000-000000000af1', '00000000-0000-0000-0000-000000000ae1', '[{"id":"q1"}]', true);

select pg_temp.expect_ok('NOTE-01 領養人存草稿',
  pg_temp.run_as('A', format($q$insert into public.meow_adoption_responses (form_id, respondent_id, respondent_name, status) values ('00000000-0000-0000-0000-000000000af1', '%s', '小明', 'draft') returning id::text$q$, pg_temp.u('A'))));
select pg_temp.expect_eq('NOTE-02 存草稿不會通知中途', '0',
  pg_temp.run_as('F', $q$select count(*)::text from public.meow_notifications$q$));
select pg_temp.expect_ok('NOTE-03 領養人送出',
  pg_temp.run_as('A', $q$update public.meow_adoption_responses set status = 'submitted' returning id::text$q$));
select pg_temp.expect_eq('NOTE-04 送出後中途收到通知，連到領養申請頁', '有人想領養「橘子」|/me/adoptions#cat-00000000-0000-0000-0000-000000000ae1',
  pg_temp.run_as('F', $q$select title || '|' || link from public.meow_notifications where type = 'adoption_response'$q$));
select pg_temp.expect_eq('NOTE-05 通知寫出填寫人名字', '1',
  pg_temp.run_as('F', $q$select count(*)::text from public.meow_notifications where body like '小明%'$q$));
select pg_temp.expect_ok('NOTE-06 中途標記待聯絡',
  pg_temp.run_as('F', $q$update public.meow_adoption_responses set status = 'contact' returning id::text$q$));
select pg_temp.expect_eq('NOTE-07 領養人收到進度通知', '「橘子」的領養申請有新進度',
  pg_temp.run_as('A', $q$select title from public.meow_notifications where type = 'adoption_status'$q$));
select pg_temp.expect_eq('NOTE-08 中途只收到一則（改狀態不會再通知中途）', '1',
  pg_temp.run_as('F', $q$select count(*)::text from public.meow_notifications$q$));
select pg_temp.expect_eq('NOTE-30 public 的函式全部 meow_ 開頭', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not like 'meow\_%'));

select status, name, detail from pg_temp.test_results order by n;

rollback;
