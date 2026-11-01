-- 收藏貓咪（#70）資料庫測試。
-- 執行方式：node supabase/tests/run-pglite.mjs（建議，完全不連 Supabase）。
-- ⚠ 會寫入測試資料（結束時 rollback），**不要在正式 Supabase 專案執行**。
-- 固定角色：O 中途（喵戶長）；A 會員；X 其他會員。輔助函式與 0004 測試相同。

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
  ('O', '00000000-0000-0000-0000-0000000008a1', 'o8@test.example'),
  ('A', '00000000-0000-0000-0000-0000000008b1', 'a8@test.example'),
  ('X', '00000000-0000-0000-0000-0000000008c1', 'x8@test.example');
insert into auth.users (id, email) select id, email from pg_temp.fx;
insert into public.meow_profiles (id, email) select id, email from pg_temp.fx;
insert into public.meow_households (id, owner_id, name, caretaker_type, city, district, default_visibility)
  values ('00000000-0000-0000-0000-0000000008d1', pg_temp.u('O'), '麥麥之家', 'personal_foster', '桃園市', '龍潭區', 'public'),
         ('00000000-0000-0000-0000-0000000008d2', pg_temp.u('O'), '私人戶', 'personal_foster', '桃園市', '龍潭區', 'private');
insert into public.meow_cats (id, household_id, name, sex, life_stage, status, visibility) values
  ('00000000-0000-0000-0000-0000000008e1', '00000000-0000-0000-0000-0000000008d1', '麥麥', 'female', 'young_adult', 'adoptable', 'public'),
  ('00000000-0000-0000-0000-0000000008e2', '00000000-0000-0000-0000-0000000008d2', '私藏', 'male', 'senior', 'own', 'private');

select pg_temp.expect_ok('FAV-01 會員可以收藏看得到的貓',
  pg_temp.run_as('A', format($q$insert into public.meow_cat_favorites (user_id, cat_id) values ('%s', '00000000-0000-0000-0000-0000000008e1') returning cat_id::text$q$, pg_temp.u('A'))));
select pg_temp.expect_err('FAV-02 同一隻貓不能收藏兩次', 'meow_cat_favorites_pkey',
  pg_temp.run_as('A', format($q$insert into public.meow_cat_favorites (user_id, cat_id) values ('%s', '00000000-0000-0000-0000-0000000008e1') returning cat_id::text$q$, pg_temp.u('A'))));
select pg_temp.expect_err('FAV-03 不能收藏看不到的貓', 'row-level security',
  pg_temp.run_as('A', format($q$insert into public.meow_cat_favorites (user_id, cat_id) values ('%s', '00000000-0000-0000-0000-0000000008e2') returning cat_id::text$q$, pg_temp.u('A'))));
select pg_temp.expect_err('FAV-04 不能替別人收藏', 'row-level security',
  pg_temp.run_as('X', format($q$insert into public.meow_cat_favorites (user_id, cat_id) values ('%s', '00000000-0000-0000-0000-0000000008e1') returning cat_id::text$q$, pg_temp.u('A'))));
select pg_temp.expect_eq('FAV-05 別人看不到我的收藏', '0',
  pg_temp.run_as('X', $q$select count(*)::text from public.meow_cat_favorites$q$));
select pg_temp.expect_eq('FAV-06 喵戶長也看不到是誰收藏', '0',
  pg_temp.run_as('O', $q$select count(*)::text from public.meow_cat_favorites$q$));
select pg_temp.expect_eq('FAV-07 喵戶長查得到收藏數', '1',
  pg_temp.run_as('O', $q$select public.meow_cat_favorite_count('00000000-0000-0000-0000-0000000008e1')::text$q$));
select pg_temp.expect_eq('FAV-08 其他人查不到收藏數', '',
  pg_temp.run_as('X', $q$select public.meow_cat_favorite_count('00000000-0000-0000-0000-0000000008e1')::text$q$));
select pg_temp.expect_eq('FAV-09 可以取消收藏', '1',
  pg_temp.run_as('A', $q$with d as (delete from public.meow_cat_favorites returning 1) select count(*)::text from d$q$));
select pg_temp.expect_eq('FAV-30 public 的函式全部 meow_ 開頭', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not like 'meow\_%'));

select status, name, detail from pg_temp.test_results order by n;

rollback;
