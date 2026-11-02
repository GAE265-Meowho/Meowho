-- 送養追蹤（0012）資料庫測試。執行方式：node supabase/tests/run-pglite.mjs。
-- ⚠ 會寫入測試資料（結束時 rollback），**不要在正式 Supabase 專案執行**。
-- 固定角色：F 中途；A 領養人（有對話串）；B 其他申請人；C 領養人（沒開過串）。輔助函式與 0004 測試相同。

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
  ('F', '00000000-0000-0000-0000-000000000c01', 'f12@test.example'),
  ('A', '00000000-0000-0000-0000-000000000c02', 'a12@test.example'),
  ('B', '00000000-0000-0000-0000-000000000c03', 'b12@test.example'),
  ('C', '00000000-0000-0000-0000-000000000c04', 'c12@test.example');
insert into auth.users (id, email) select id, email from pg_temp.fx;
insert into public.meow_profiles (id, email, display_name) select id, email, code || ' 本人' from pg_temp.fx;
insert into public.meow_households (id, owner_id, name, caretaker_type, city, district, default_visibility) values
  ('00000000-0000-0000-0000-000000000cd1', pg_temp.u('F'), '小晴的中途貓屋', 'personal_foster', '台中市', '北屯區', 'public'),
  ('00000000-0000-0000-0000-000000000cd2', pg_temp.u('A'), 'A 的新家', 'cat_owner', '台北市', '大安區', 'private'),
  ('00000000-0000-0000-0000-000000000cd3', pg_temp.u('C'), 'C 的新家', 'cat_owner', '台北市', '信義區', 'private');
insert into public.meow_cats (id, household_id, name, sex, life_stage, status) values
  ('00000000-0000-0000-0000-000000000ce1', '00000000-0000-0000-0000-000000000cd1', '橘子', 'male', 'adult', 'adoptable'),
  ('00000000-0000-0000-0000-000000000ce2', '00000000-0000-0000-0000-000000000cd1', '豆花', 'female', 'kitten', 'adoptable');

select pg_temp.run_as('A', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000ce1')::text$q$);
select pg_temp.run_as('B', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000ce1')::text$q$);

-- 橘子移轉到 A 的新家（移轉流程還沒做，用管理身分模擬）
select set_config('meow.cat_flow', 'on', true);
update public.meow_cats set household_id = '00000000-0000-0000-0000-000000000cd2', status = 'own', origin_household_id = '00000000-0000-0000-0000-000000000cd1'
 where id = '00000000-0000-0000-0000-000000000ce1';
select set_config('meow.cat_flow', '', true);

select pg_temp.expect_eq('HOM-01 移轉後這隻貓的串都進送養追蹤，只有領養人那串標領養人', 'A 本人:true|B 本人:false',
  pg_temp.run_as('F', $q$select string_agg(member_name || ':' || is_adopter, '|' order by member_name) from public.meow_threads where homed_at is not null$q$));
select pg_temp.expect_eq('HOM-02 其他申請人的通知連到領養管理', '/me/adoptions?t=',
  pg_temp.run_as('B', $q$select left(link, 16) from public.meow_notifications where type = 'adoption_status'$q$));
select pg_temp.expect_err('HOM-03 找到家的串不能婉拒', 'thread_homed',
  pg_temp.run_as('F', $q$select public.meow_decline_thread(id)::text from public.meow_threads where member_name = 'A 本人'$q$));

-- 豆花移轉到 C 的新家，C 從沒私訊過
select set_config('meow.cat_flow', 'on', true);
update public.meow_cats set household_id = '00000000-0000-0000-0000-000000000cd3', status = 'own', origin_household_id = '00000000-0000-0000-0000-000000000cd1'
 where id = '00000000-0000-0000-0000-000000000ce2';
select set_config('meow.cat_flow', '', true);

select pg_temp.expect_eq('HOM-10 領養人沒開過串時自動建立，給中途追蹤近況', '豆花|小晴的中途貓屋|true|「豆花」正式成為你的家人了。',
  pg_temp.run_as('C', $q$select t.cat_name || '|' || t.household_name || '|' || t.is_adopter || '|' || m.body
                         from public.meow_threads t join public.meow_messages m on m.thread_id = t.id$q$));
select pg_temp.expect_eq('HOM-11 中途看得到這一串，而且不算未讀', '1|false',
  pg_temp.run_as('F', $q$select count(*)::text || '|' || bool_or(last_message_at > coalesce(keeper_read_at, '-infinity')) from public.meow_threads where cat_name = '豆花'$q$));
select pg_temp.expect_ok('HOM-12 中途可以傳訊息給領養人',
  pg_temp.run_as('F', $q$select public.meow_send_message(id, '豆花還好嗎？')::text from public.meow_threads where cat_name = '豆花'$q$));
select pg_temp.expect_eq('HOM-13 新訊息通知連到領養管理', '/me/adoptions?t=',
  pg_temp.run_as('C', $q$select left(link, 16) from public.meow_notifications where type = 'message'$q$));

-- 橘子退養回到中途，重新等家
select set_config('meow.cat_flow', 'on', true);
update public.meow_cats set household_id = '00000000-0000-0000-0000-000000000cd1', status = 'adoptable', origin_household_id = null
 where id = '00000000-0000-0000-0000-000000000ce1';
select set_config('meow.cat_flow', '', true);

select pg_temp.expect_eq('HOM-20 退養回來後原本的串還在送養追蹤', '2',
  pg_temp.run_as('F', $q$select count(*)::text from public.meow_threads where cat_name = '橘子' and homed_at is not null$q$));
select pg_temp.expect_ok('HOM-21 之前的申請人再私訊',
  pg_temp.run_as('B', $q$select public.meow_open_thread('00000000-0000-0000-0000-000000000ce1')::text$q$));
select pg_temp.expect_eq('HOM-22 沿用原串並移回一般分類', '1|null',
  pg_temp.run_as('B', $q$select count(*)::text || '|' || coalesce(max(homed_at)::text, 'null') from public.meow_threads$q$));

select pg_temp.expect_eq('HOM-90 內部輔助函式前端不能呼叫', 'false',
  has_function_privilege('authenticated', 'public.meow_mark_cat_homed(uuid,uuid,uuid,timestamptz)', 'execute')::text);

select status, name, detail from pg_temp.test_results order by n;

rollback;
