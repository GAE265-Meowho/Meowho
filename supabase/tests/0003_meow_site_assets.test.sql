-- MeowHQ 網站外觀（Issue #23）資料庫測試：Logo／Demo 加速設定、稽核日誌、meow-site-assets bucket 與上傳權限。
-- 執行方式：node supabase/tests/run-pglite.mjs（建議，完全不連 Supabase）；或本機 Supabase 以 psql 執行本檔。
-- ⚠ 會寫入測試資料（結束時 rollback），**不要在共用的正式 Supabase 專案執行**。
-- 固定角色：SA 系統管理員；AD 管理員（用戶權限管理）；X 一般會員。輔助函式建在 pg_temp。

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

create function pg_temp.try_sql(p_sql text) returns text language plpgsql as $fn$
begin
  execute p_sql;
  return '';
exception when others then
  return 'ERROR: ' || sqlerrm;
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

-- ---------------------------------------------------------------- 測試資料
insert into pg_temp.fx values
  ('SA', '00000000-0000-0000-0000-0000000003a1', 'sa3@test.example'),
  ('AD', '00000000-0000-0000-0000-0000000003b1', 'ad3@test.example'),
  ('X',  '00000000-0000-0000-0000-0000000003d1', 'x3@test.example');
insert into auth.users (id, email) select id, email from pg_temp.fx;
insert into public.meow_profiles (id, email, role) values
  (pg_temp.u('SA'), 'sa3@test.example', 'system_admin'),
  (pg_temp.u('AD'), 'ad3@test.example', 'admin'),
  (pg_temp.u('X'),  'x3@test.example',  'member');
insert into public.meow_admin_module_grants (admin_id, module) values (pg_temp.u('AD'), 'user_management');

-- ---------------------------------------------------------------- 網站設定函式
select pg_temp.expect_ok('SITE-01 系統管理員可設定 Logo（內建代號）',
  pg_temp.run_as('SA', $q$select public.meow_set_site_setting('logo', '"round"'::jsonb, '改用圓潤款')::text$q$));
select pg_temp.expect_eq('SITE-01 meow_site_settings 已更新', '"round"', (select value::text from public.meow_site_settings where key = 'logo'));
select pg_temp.expect_eq('SITE-02 寫入稽核日誌 update_setting（含操作者、原因、key）', 'update_setting|logo|改用圓潤款|true',
  (select action || '|' || (detail ->> 'key') || '|' || reason || '|' || (actor_id = pg_temp.u('SA'))::text
     from public.meow_audit_logs order by id desc limit 1));
select pg_temp.expect_ok('SITE-03 Logo 可設為上傳檔案的網址',
  pg_temp.run_as('SA', $q$select public.meow_set_site_setting('logo', '"https://example.supabase.co/storage/v1/object/public/meow-site-assets/logos/1-a.png"'::jsonb, '上傳新 Logo')::text$q$));
select pg_temp.expect_ok('SITE-04 Demo 加速模式（布林）',
  pg_temp.run_as('SA', $q$select public.meow_set_site_setting('demo_speed', 'true'::jsonb, 'Demo 彩排')::text$q$));
select pg_temp.expect_err('SITE-05 Demo 加速模式只接受布林', 'invalid_value',
  pg_temp.run_as('SA', $q$select public.meow_set_site_setting('demo_speed', '"yes"'::jsonb, 'x')::text$q$));
select pg_temp.expect_err('SITE-06 Logo 只接受非空字串', 'invalid_value',
  pg_temp.run_as('SA', $q$select public.meow_set_site_setting('logo', '123'::jsonb, 'x')::text$q$));
select pg_temp.expect_err('SITE-07 不允許的設定項目', 'invalid_key',
  pg_temp.run_as('SA', $q$select public.meow_set_site_setting('theme', '"dark"'::jsonb, 'x')::text$q$));
select pg_temp.expect_err('SITE-08 原因必填', 'reason_required',
  pg_temp.run_as('SA', $q$select public.meow_set_site_setting('logo', '"house"'::jsonb, '   ')::text$q$));
select pg_temp.expect_err('SITE-09 管理員（非系統管理員）不能變更網站設定', 'need_system_admin',
  pg_temp.run_as('AD', $q$select public.meow_set_site_setting('logo', '"house"'::jsonb, 'x')::text$q$));
select pg_temp.expect_err('SITE-10 未登入不能呼叫', '',
  pg_temp.run_as(null, $q$select public.meow_set_site_setting('logo', '"house"'::jsonb, 'x')::text$q$));
select pg_temp.expect_err('SITE-11 稽核日誌 action 仍拒絕未知值', 'check',
  pg_temp.try_sql($q$insert into public.meow_audit_logs (actor_id, action, target_type, target_id, reason) values (gen_random_uuid(), 'hack', 'x', 'x', 'x')$q$));
select pg_temp.expect_eq('SITE-12 管理員看不到網站設定以外的寫入：直接改 meow_site_settings 被 RLS 擋下（0 筆）', '0',
  pg_temp.run_as('AD', $q$with u as (update public.meow_site_settings set value = '"line"'::jsonb where key = 'logo' returning 1) select count(*)::text from u$q$));

-- ---------------------------------------------------------------- Storage bucket 與上傳權限
select pg_temp.expect_eq('SITE-20 bucket meow-site-assets 為公開、上限 1 MB、只收圖片', 'true|1048576|image/png,image/jpeg,image/svg+xml,image/webp',
  (select public::text || '|' || file_size_limit::text || '|' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'meow-site-assets'));
select pg_temp.expect_ok('SITE-21 系統管理員可上傳到 meow-site-assets',
  pg_temp.run_as('SA', $q$with i as (insert into storage.objects (bucket_id, name) values ('meow-site-assets', 'logos/1-a.png') returning 1) select count(*)::text from i$q$));
select pg_temp.expect_err('SITE-22 管理員不能上傳到 meow-site-assets', '',
  pg_temp.run_as('AD', $q$insert into storage.objects (bucket_id, name) values ('meow-site-assets', 'logos/2-b.png') returning name$q$));
select pg_temp.expect_err('SITE-23 一般會員不能上傳到 meow-site-assets', '',
  pg_temp.run_as('X', $q$insert into storage.objects (bucket_id, name) values ('meow-site-assets', 'logos/3-c.png') returning name$q$));
select pg_temp.expect_eq('SITE-24 管理員不能刪除 meow-site-assets 的檔案（0 筆）', '0',
  pg_temp.run_as('AD', $q$with d as (delete from storage.objects where bucket_id = 'meow-site-assets' returning 1) select count(*)::text from d$q$));
select pg_temp.expect_eq('SITE-25 系統管理員可刪除 meow-site-assets 的檔案', '1',
  pg_temp.run_as('SA', $q$with d as (delete from storage.objects where bucket_id = 'meow-site-assets' returning 1) select count(*)::text from d$q$));

-- ---------------------------------------------------------------- 命名與執行權
select pg_temp.expect_eq('SITE-30 public 的函式全部 meow_ 開頭', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not like 'meow\_%'));
select pg_temp.expect_eq('SITE-31 storage policy 名稱以 meow: 開頭', '0',
  (select count(*)::text from pg_policies where schemaname = 'storage' and policyname not like 'meow:%'));
select pg_temp.expect_eq('SITE-32 anon 不能執行 meow_set_site_setting', 'false',
  (select has_function_privilege('anon', 'public.meow_set_site_setting(text, jsonb, text)', 'execute')::text));

select status, name, detail from pg_temp.test_results order by n;

rollback;
