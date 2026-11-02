-- 建立貓咪重新盤點（#109）資料庫測試：年齡層三級、狀態只能走流程、退養請求。
-- 執行方式：node supabase/tests/run-pglite.mjs（建議，完全不連 Supabase）。
-- ⚠ 會寫入測試資料（結束時 rollback），**不要在正式 Supabase 專案執行**。
-- 固定角色：F 中途；G 一般飼主（領養了 F 的貓）；X 其他會員。輔助函式與 0004 測試相同。
-- runner 會在跑 0009 之前先放一隻舊年齡層（young_adult）的貓 ...09f0，檢查轉換。

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
  ('F', '00000000-0000-0000-0000-0000000009a1', 'f9@test.example'),
  ('G', '00000000-0000-0000-0000-0000000009b1', 'g9@test.example'),
  ('X', '00000000-0000-0000-0000-0000000009c1', 'x9@test.example');
insert into auth.users (id, email) select id, email from pg_temp.fx where not exists (select 1 from auth.users u where u.id = fx.id);
insert into public.meow_profiles (id, email) select id, email from pg_temp.fx where not exists (select 1 from public.meow_profiles p where p.id = fx.id);
insert into public.meow_households (id, owner_id, name, caretaker_type, city, district, default_visibility)
  values ('00000000-0000-0000-0000-0000000009d1', pg_temp.u('F'), '麥麥之家', 'personal_foster', '桃園市', '龍潭區', 'public'),
         ('00000000-0000-0000-0000-0000000009d2', pg_temp.u('G'), '小家', 'cat_owner', '台北市', '大安區', 'private'),
         ('00000000-0000-0000-0000-0000000009d3', pg_temp.u('F'), '第二個中途', 'personal_foster', '桃園市', '中壢區', 'public');
-- 移轉流程還沒做（不在 #109），用管理身分直接放：C 從 F 領養到 G；N 沒有原中途；D 的原中途是 d3
insert into public.meow_cats (id, household_id, origin_household_id, name, sex, life_stage, status, timeline) values
  ('00000000-0000-0000-0000-0000000009e1', '00000000-0000-0000-0000-0000000009d2', '00000000-0000-0000-0000-0000000009d1', '麥麥', 'female', 'adult', 'own', '[{"date":"2026-10-01","event":"到新家"}]'),
  ('00000000-0000-0000-0000-0000000009e2', '00000000-0000-0000-0000-0000000009d2', null, '自己的', 'male', 'senior', 'own', '[]'),
  ('00000000-0000-0000-0000-0000000009e3', '00000000-0000-0000-0000-0000000009d2', '00000000-0000-0000-0000-0000000009d3', '豆豆', 'male', 'kitten', 'own', '[]');
insert into public.meow_adoption_forms (cat_id, questions, is_open)
  values ('00000000-0000-0000-0000-0000000009e1', '[{"id":"q1"}]', false);

-- 年齡層
select pg_temp.expect_eq('RET-01 舊的年輕成貓／成熟成貓轉成壯貓', 'adult',
  (select life_stage from public.meow_cats where id = '00000000-0000-0000-0000-0000000009f0'));
select pg_temp.expect_err('RET-02 年齡層不接受舊代號', 'meow_cats_life_stage_check',
  pg_temp.run_as('F', $q$insert into public.meow_cats (household_id, name, sex, life_stage) values ('00000000-0000-0000-0000-0000000009d1', '橘子', 'male', 'young_adult') returning id::text$q$));

-- 新增貓
select pg_temp.expect_eq('RET-03 中途新增的貓一律是待領養', 'adoptable',
  pg_temp.run_as('F', $q$insert into public.meow_cats (household_id, name, sex, life_stage) values ('00000000-0000-0000-0000-0000000009d1', '橘子', 'male', 'kitten') returning status$q$));
select pg_temp.expect_err('RET-04 中途不能直接新增自家貓', 'cat_status_flow_only',
  pg_temp.run_as('F', $q$insert into public.meow_cats (household_id, name, sex, life_stage, status) values ('00000000-0000-0000-0000-0000000009d1', '橘子', 'male', 'kitten', 'own') returning id::text$q$));
select pg_temp.expect_err('RET-05 一般飼主的喵戶不能新增貓', 'cat_owner_cannot_add_cat',
  pg_temp.run_as('G', $q$insert into public.meow_cats (household_id, name, sex, life_stage) values ('00000000-0000-0000-0000-0000000009d2', '咪咪', 'female', 'adult') returning id::text$q$));

-- 修改、刪除
select pg_temp.expect_err('RET-06 中途不能直接改狀態', 'cat_status_flow_only',
  pg_temp.run_as('F', $q$update public.meow_cats set status = 'own' where name = '橘子' returning id::text$q$));
select pg_temp.expect_ok('RET-07 中途可以改其他欄位',
  pg_temp.run_as('F', $q$update public.meow_cats set coat = '橘白' where name = '橘子' returning id::text$q$));
select pg_temp.expect_err('RET-08 飼主不能把領養來的貓改回待領養', 'cat_status_flow_only',
  pg_temp.run_as('G', $q$update public.meow_cats set status = 'adoptable' where id = '00000000-0000-0000-0000-0000000009e1' returning id::text$q$));
select pg_temp.expect_err('RET-09 飼主不能把貓搬到別的喵戶', 'cat_status_flow_only',
  pg_temp.run_as('G', $q$update public.meow_cats set household_id = '00000000-0000-0000-0000-0000000009d1' where id = '00000000-0000-0000-0000-0000000009e1' returning id::text$q$));
select pg_temp.expect_err('RET-10 飼主不能清掉原中途', 'cat_status_flow_only',
  pg_temp.run_as('G', $q$update public.meow_cats set origin_household_id = null where id = '00000000-0000-0000-0000-0000000009e1' returning id::text$q$));
select pg_temp.expect_err('RET-11 飼主不能刪掉領養來的貓', 'cat_has_origin',
  pg_temp.run_as('G', $q$delete from public.meow_cats where id = '00000000-0000-0000-0000-0000000009e1' returning id::text$q$));

-- 提出、撤回
select pg_temp.expect_err('RET-12 不是飼主不能提出退養', 'return_not_owner',
  pg_temp.run_as('X', $q$select public.meow_request_cat_return('00000000-0000-0000-0000-0000000009e1', '搬家')::text$q$));
select pg_temp.expect_err('RET-13 沒有原中途的貓不能退養', 'return_no_origin',
  pg_temp.run_as('G', $q$select public.meow_request_cat_return('00000000-0000-0000-0000-0000000009e2', '搬家')::text$q$));
select pg_temp.expect_err('RET-14 要寫退養原因', 'return_reason_required',
  pg_temp.run_as('G', $q$select public.meow_request_cat_return('00000000-0000-0000-0000-0000000009e1', '  ')::text$q$));
select pg_temp.expect_ok('RET-15 飼主可以提出退養請求',
  pg_temp.run_as('G', $q$select public.meow_request_cat_return('00000000-0000-0000-0000-0000000009e1', '要出國工作')::text$q$));
select pg_temp.expect_eq('RET-16 原中途收到通知', '1',
  pg_temp.run_as('F', $q$select count(*)::text from public.meow_notifications where type = 'cat_return_request'$q$));
select pg_temp.expect_err('RET-17 同一隻貓只能有一筆處理中的請求', 'meow_cat_returns_one_pending',
  pg_temp.run_as('G', $q$select public.meow_request_cat_return('00000000-0000-0000-0000-0000000009e1', '再一次')::text$q$));
select pg_temp.expect_eq('RET-18 原中途看得到請求', '1',
  pg_temp.run_as('F', $q$select count(*)::text from public.meow_cat_returns$q$));
select pg_temp.expect_eq('RET-19 其他人看不到請求', '0',
  pg_temp.run_as('X', $q$select count(*)::text from public.meow_cat_returns$q$));
select pg_temp.expect_eq('RET-20 不能直接改退養請求表', '0',
  pg_temp.run_as('G', $q$with u as (update public.meow_cat_returns set status = 'returned' returning 1) select count(*)::text from u$q$));
select pg_temp.expect_err('RET-21 飼主不能自己收回', 'return_not_pending',
  pg_temp.run_as('G', $q$select public.meow_resolve_cat_return((select id from public.meow_cat_returns where status = 'pending'), true)::text$q$));
select pg_temp.expect_ok('RET-22 飼主可以撤回',
  pg_temp.run_as('G', $q$select public.meow_withdraw_cat_return((select id from public.meow_cat_returns where status = 'pending'))::text$q$));
select pg_temp.expect_err('RET-23 撤回後不能再撤回', 'return_not_pending',
  pg_temp.run_as('G', $q$select public.meow_withdraw_cat_return((select id from public.meow_cat_returns limit 1))::text$q$));

-- 婉拒
select pg_temp.expect_ok('RET-24 撤回後可以再提出',
  pg_temp.run_as('G', $q$select public.meow_request_cat_return('00000000-0000-0000-0000-0000000009e1', '還是養不下去')::text$q$));
select pg_temp.expect_ok('RET-25 原中途可以婉拒',
  pg_temp.run_as('F', $q$select public.meow_resolve_cat_return((select id from public.meow_cat_returns where status = 'pending'), false)::text$q$));
select pg_temp.expect_eq('RET-26 婉拒後貓還在飼主家', '00000000-0000-0000-0000-0000000009d2/own',
  (select household_id::text || '/' || status from public.meow_cats where id = '00000000-0000-0000-0000-0000000009e1'));

-- 收回
select pg_temp.expect_ok('RET-27 再提出一次',
  pg_temp.run_as('G', $q$select public.meow_request_cat_return('00000000-0000-0000-0000-0000000009e1', '真的不行了')::text$q$));
select pg_temp.expect_err('RET-28 其他人不能收回', 'return_not_pending',
  pg_temp.run_as('X', $q$select public.meow_resolve_cat_return((select id from public.meow_cat_returns where status = 'pending'), true)::text$q$));
select pg_temp.expect_ok('RET-29 原中途確認收回',
  pg_temp.run_as('F', $q$select public.meow_resolve_cat_return((select id from public.meow_cat_returns where status = 'pending'), true)::text$q$));
select pg_temp.expect_eq('RET-30 收回後回到原中途、待領養、沒有原中途', '00000000-0000-0000-0000-0000000009d1/adoptable/',
  (select household_id::text || '/' || status || '/' || coalesce(origin_household_id::text, '') from public.meow_cats where id = '00000000-0000-0000-0000-0000000009e1'));
select pg_temp.expect_eq('RET-31 時間軸多一筆退養回到中途，原本的還在', '2/退養回到中途',
  (select jsonb_array_length(timeline)::text || '/' || (timeline -> -1 ->> 'event') from public.meow_cats where id = '00000000-0000-0000-0000-0000000009e1'));
select pg_temp.expect_eq('RET-32 原本的問卷保留、維持暫停', 'false',
  (select is_open::text from public.meow_adoption_forms where cat_id = '00000000-0000-0000-0000-0000000009e1'));
select pg_temp.expect_eq('RET-33 飼主收到結果通知', '2',
  pg_temp.run_as('G', $q$select count(*)::text from public.meow_notifications where type = 'cat_return_result'$q$));
select pg_temp.expect_eq('RET-34 飼主還看得到自己的請求紀錄（撤回、婉拒、收回）', '3',
  pg_temp.run_as('G', $q$select count(*)::text from public.meow_cat_returns$q$));
select pg_temp.expect_ok('RET-35 收回之後中途可以重新開放問卷',
  pg_temp.run_as('F', $q$update public.meow_adoption_forms set is_open = true where cat_id = '00000000-0000-0000-0000-0000000009e1' returning id::text$q$));

-- 原中途刪除喵戶
select pg_temp.expect_ok('RET-36 中途可以刪除喵戶，即使有貓被領養出去',
  pg_temp.run_as('F', $q$delete from public.meow_households where id = '00000000-0000-0000-0000-0000000009d3' returning id::text$q$));
select pg_temp.expect_eq('RET-37 被領養出去的貓留在飼主家，沒有原中途', '00000000-0000-0000-0000-0000000009d2/',
  (select household_id::text || '/' || coalesce(origin_household_id::text, '') from public.meow_cats where id = '00000000-0000-0000-0000-0000000009e3'));

select pg_temp.expect_eq('RET-40 public 的函式全部 meow_ 開頭', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not like 'meow\_%'));

select status, name, detail from pg_temp.test_results order by n;

rollback;
