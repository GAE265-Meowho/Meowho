-- 依身分建立喵戶、貓咪送養文欄位（#82）資料庫測試。
-- 執行方式：node supabase/tests/run-pglite.mjs（建議，完全不連 Supabase）。
-- ⚠ 會寫入測試資料（結束時 rollback），**不要在正式 Supabase 專案執行**。
-- 固定角色：O 喵戶長；X 其他會員。輔助函式與 0004 測試相同。

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
  ('O', '00000000-0000-0000-0000-0000000006a1', 'o6@test.example'),
  ('X', '00000000-0000-0000-0000-0000000006b1', 'x6@test.example');
insert into auth.users (id, email) select id, email from pg_temp.fx;
insert into public.meow_profiles (id, email) select id, email from pg_temp.fx;

create function pg_temp.new_home(p_name text, p_type text default 'personal_foster') returns text language sql as $fn$
  select pg_temp.run_as('O', format(
    $q$insert into public.meow_households (owner_id, name, caretaker_type, city, district) values ('%s', '%s', '%s', '台中市', '北屯區') returning id::text$q$,
    pg_temp.u('O'), p_name, p_type))
$fn$;

-- ---------------------------------------------------------------- 喵戶數量上限
select pg_temp.expect_eq('HH-01 預設不限制喵戶數量', 'null', (select value::text from public.meow_site_settings where key = 'household_limit'));
select pg_temp.new_home('第一戶'), pg_temp.new_home('第二戶');
select pg_temp.expect_ok('HH-02 不限制時可以建第 3 個喵戶', pg_temp.new_home('第三戶'));
update public.meow_site_settings set value = '3' where key = 'household_limit';
select pg_temp.expect_err('HH-03 設定上限後擋下', 'household_limit', pg_temp.new_home('第四戶'));
update public.meow_site_settings set value = 'null' where key = 'household_limit';

-- ---------------------------------------------------------------- 喵戶新欄位
select pg_temp.expect_ok('HH-04 一般飼主可存居住環境',
  pg_temp.run_as('O', $q$insert into public.meow_households (owner_id, name, caretaker_type, city, district, home)
    values ('00000000-0000-0000-0000-0000000006a1', '子哲的家', 'cat_owner', '台中市', '北屯區', '{"dwelling":"apartment","renting":true}') returning id::text$q$));
select pg_temp.expect_ok('HH-05 立案中途可存單位名稱、證明連結與預設送養條件',
  pg_temp.run_as('O', $q$insert into public.meow_households (owner_id, name, caretaker_type, city, district, org_name, org_proof_url, adoption_terms)
    values ('00000000-0000-0000-0000-0000000006a1', '貓之家', 'shelter_org', '台中市', '北屯區', '台中貓協會', 'https://example.org', '{"items":["家訪"],"note":""}') returning id::text$q$));
select pg_temp.expect_err('HH-06 居住環境必須是物件', 'meow_households_home_check',
  pg_temp.run_as('O', $q$update public.meow_households set home = '[1,2]' where name = '子哲的家' returning id::text$q$));
select pg_temp.expect_err('HH-07 身分建立後不能切換', 'caretaker_type_locked',
  pg_temp.run_as('O', $q$update public.meow_households set caretaker_type = 'personal_foster' where name = '子哲的家' returning id::text$q$));
select pg_temp.expect_eq('HH-08 其他會員不能改別人的喵戶', '0',
  pg_temp.run_as('X', $q$with u as (update public.meow_households set adoption_terms = '{"items":[],"note":"x"}' where name = '貓之家' returning 1) select count(*)::text from u$q$));

-- ---------------------------------------------------------------- 貓咪新欄位
create temp table h1 as select id from public.meow_households where name = '第一戶';
create function pg_temp.new_cat(p_cols text default '', p_vals text default '') returns text language sql as $fn$
  select pg_temp.run_as('O', format(
    $q$insert into public.meow_cats (household_id, name, sex, life_stage %s) values ('%s', '麥麥', 'female', 'young_adult' %s) returning id::text$q$,
    p_cols, (select id from h1), p_vals))
$fn$;
select pg_temp.expect_ok('CAT-01 不填新欄位也能建立（有預設值）', pg_temp.new_cat());
select pg_temp.expect_eq('CAT-02 新欄位預設值', '{}|{}|{}|{}|',
  (select medical::text || '|' || compat::text || '|' || habits::text || '|' || handover::text || '|' || coalesce(adoption_terms::text, '')
     from public.meow_cats where household_id = (select id from h1) limit 1));
select pg_temp.expect_ok('CAT-03 可存醫療細項、相處、習慣、送養條件、交接物品',
  pg_temp.new_cat(', medical, compat, habits, adoption_terms, handover',
    $v$, '{"vaccineDoses":1,"fivFelv":"negative"}', '{"cats":"yes","dogs":"unknown","kids":"no"}', '{護食}', '{"items":["不放養"],"note":""}', '{疫苗卡或病歷}'$v$));
select pg_temp.expect_err('CAT-04 醫療細項必須是物件', 'meow_cats_medical_check',
  pg_temp.new_cat(', medical', $v$, '"打了一劑"'$v$));
select pg_temp.expect_eq('CAT-05 其他會員不能改別人的貓', '0',
  pg_temp.run_as('X', $q$with u as (update public.meow_cats set habits = '{抓家具}' returning 1) select count(*)::text from u$q$));

-- ---------------------------------------------------------------- 命名
select pg_temp.expect_eq('HH-30 public 的函式全部 meow_ 開頭', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not like 'meow\_%'));

select status, name, detail from pg_temp.test_results order by n;

rollback;
