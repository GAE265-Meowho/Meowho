-- 領養問卷（#89）資料庫測試。
-- 執行方式：node supabase/tests/run-pglite.mjs（建議，完全不連 Supabase）。
-- ⚠ 會寫入測試資料（結束時 rollback），**不要在正式 Supabase 專案執行**。
-- 固定角色：O 中途（喵戶長）；A 領養人；X 其他會員。輔助函式與 0004 測試相同。

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
  ('O', '00000000-0000-0000-0000-0000000007a1', 'o7@test.example'),
  ('A', '00000000-0000-0000-0000-0000000007b1', 'a7@test.example'),
  ('X', '00000000-0000-0000-0000-0000000007c1', 'x7@test.example');
insert into auth.users (id, email) select id, email from pg_temp.fx;
insert into public.meow_profiles (id, email) select id, email from pg_temp.fx;
insert into public.meow_households (id, owner_id, name, caretaker_type, city, district)
  values ('00000000-0000-0000-0000-0000000007d1', pg_temp.u('O'), '麥麥之家', 'personal_foster', '桃園市', '龍潭區');
insert into public.meow_cats (id, household_id, name, sex, life_stage, status) values
  ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007d1', '麥麥', 'female', 'young_adult', 'adoptable'),
  ('00000000-0000-0000-0000-0000000007e2', '00000000-0000-0000-0000-0000000007d1', '自家貓', 'male', 'senior', 'own'),
  ('00000000-0000-0000-0000-0000000007e3', '00000000-0000-0000-0000-0000000007d1', '小黑', 'male', 'kitten', 'adoptable');

-- ---------------------------------------------------------------- 問卷
select pg_temp.expect_ok('FORM-01 中途可以替待領養貓建立問卷',
  pg_temp.run_as('O', $q$insert into public.meow_adoption_forms (cat_id, questions) values ('00000000-0000-0000-0000-0000000007e1', '[{"id":"intro"}]') returning id::text$q$));
select pg_temp.expect_err('FORM-02 自家貓不能開放問卷', 'form_cat_not_adoptable',
  pg_temp.run_as('O', $q$insert into public.meow_adoption_forms (cat_id, questions) values ('00000000-0000-0000-0000-0000000007e2', '[{"id":"intro"}]') returning id::text$q$));
select pg_temp.expect_err('FORM-03 其他會員不能替別人的貓建問卷', 'row-level security',
  pg_temp.run_as('X', $q$insert into public.meow_adoption_forms (cat_id, questions) values ('00000000-0000-0000-0000-0000000007e3', '[{"id":"intro"}]') returning id::text$q$));
select pg_temp.expect_err('FORM-04 問卷至少一題', 'meow_adoption_forms_questions_check',
  pg_temp.run_as('O', $q$update public.meow_adoption_forms set questions = '[]' returning id::text$q$));
select pg_temp.expect_eq('FORM-05 匿名訪客讀得到開放中的問卷題目', '1',
  pg_temp.run_as(null, $q$select count(*)::text from public.meow_adoption_forms$q$));
create temp table f1 as select id from public.meow_adoption_forms limit 1;

-- ---------------------------------------------------------------- 回覆
select pg_temp.expect_ok('RESP-01 領養人可以存草稿',
  pg_temp.run_as('A', format($q$insert into public.meow_adoption_responses (form_id, respondent_id, answers) values ('%s', '%s', '{"intro":"你好"}') returning id::text$q$, (select id from f1), pg_temp.u('A'))));
select pg_temp.expect_err('RESP-02 同一份問卷不能有兩份進行中的回覆', 'meow_adoption_responses_one_active',
  pg_temp.run_as('A', format($q$insert into public.meow_adoption_responses (form_id, respondent_id) values ('%s', '%s') returning id::text$q$, (select id from f1), pg_temp.u('A'))));
select pg_temp.expect_err('RESP-03 不能替別人填', 'row-level security',
  pg_temp.run_as('X', format($q$insert into public.meow_adoption_responses (form_id, respondent_id) values ('%s', '%s') returning id::text$q$, (select id from f1), pg_temp.u('A'))));
select pg_temp.expect_eq('RESP-04 其他會員看不到別人的回覆', '0',
  pg_temp.run_as('X', $q$select count(*)::text from public.meow_adoption_responses$q$));
select pg_temp.expect_err('RESP-05 喵戶長不能動草稿', 'response_owner_status_only',
  pg_temp.run_as('O', $q$update public.meow_adoption_responses set status = 'contact' returning id::text$q$));
select pg_temp.expect_ok('RESP-06 領養人送出',
  pg_temp.run_as('A', $q$update public.meow_adoption_responses set answers = '{"intro":"你好，我想領養"}', status = 'submitted' returning id::text$q$));
select pg_temp.expect_eq('RESP-07 送出時記下時間', 'true',
  (select (submitted_at is not null)::text from public.meow_adoption_responses limit 1));
select pg_temp.expect_err('RESP-08 送出後領養人不能再改', 'response_locked',
  pg_temp.run_as('A', $q$update public.meow_adoption_responses set answers = '{}' returning id::text$q$));
select pg_temp.expect_eq('RESP-09 喵戶長看得到送出的回覆', '1',
  pg_temp.run_as('O', $q$select count(*)::text from public.meow_adoption_responses$q$));
select pg_temp.expect_ok('RESP-10 喵戶長可以改狀態',
  pg_temp.run_as('O', $q$update public.meow_adoption_responses set status = 'contact' returning id::text$q$));
select pg_temp.expect_err('RESP-11 喵戶長不能改答案', 'response_owner_status_only',
  pg_temp.run_as('O', $q$update public.meow_adoption_responses set answers = '{"intro":"改掉"}' returning id::text$q$));

-- ---------------------------------------------------------------- 貓不再待領養
update public.meow_cats set status = 'adopted' where id = '00000000-0000-0000-0000-0000000007e1';
select pg_temp.expect_eq('FORM-06 貓改成已領養時問卷自動關閉', 'false', (select is_open::text from public.meow_adoption_forms limit 1));
select pg_temp.expect_err('FORM-07 關閉後不能再填', 'row-level security',
  pg_temp.run_as('X', format($q$insert into public.meow_adoption_responses (form_id, respondent_id) values ('%s', '%s') returning id::text$q$, (select id from f1), pg_temp.u('X'))));
select pg_temp.expect_err('FORM-08 不是待領養就不能重新開放', 'form_cat_not_adoptable',
  pg_temp.run_as('O', $q$update public.meow_adoption_forms set is_open = true returning id::text$q$));

-- ---------------------------------------------------------------- 照片 bucket
select pg_temp.expect_eq('PHOTO-01 領養人居家照片的 bucket 是私人的', 'false',
  (select public::text from storage.buckets where id = 'meow-adoption-photos'));

-- ---------------------------------------------------------------- 喵戶名稱不重複
select pg_temp.expect_err('NAME-01 同一個帳號不能有同名的喵戶', 'household_name_taken',
  pg_temp.run_as('O', format($q$insert into public.meow_households (owner_id, name, caretaker_type, city, district) values ('%s', ' 麥麥之家 ', 'cat_owner', '桃園市', '龍潭區') returning id::text$q$, pg_temp.u('O'))));
select pg_temp.expect_ok('NAME-02 不同帳號可以同名',
  pg_temp.run_as('X', format($q$insert into public.meow_households (owner_id, name, caretaker_type, city, district) values ('%s', '麥麥之家', 'cat_owner', '桃園市', '龍潭區') returning id::text$q$, pg_temp.u('X'))));
select pg_temp.run_as('O', format($q$insert into public.meow_households (owner_id, name, caretaker_type, city, district) values ('%s', '第二戶', 'cat_owner', '桃園市', '龍潭區') returning id::text$q$, pg_temp.u('O')));
select pg_temp.expect_err('NAME-03 改名也不能撞到自己的另一戶', 'household_name_taken',
  pg_temp.run_as('O', $q$update public.meow_households set name = '麥麥之家' where name = '第二戶' returning id::text$q$));

-- ---------------------------------------------------------------- 命名
select pg_temp.expect_eq('FORM-30 public 的資料表全部 meow_ 開頭', '0',
  (select count(*)::text from pg_tables where schemaname = 'public' and tablename not like 'meow\_%'));
select pg_temp.expect_eq('FORM-31 public 的函式全部 meow_ 開頭', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not like 'meow\_%'));

select status, name, detail from pg_temp.test_results order by n;

rollback;
