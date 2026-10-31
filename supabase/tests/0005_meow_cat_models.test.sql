-- MeowHQ 貓咪模型（#75）資料庫測試：表、上架函式、bucket。結束 rollback；不要在正式專案執行。
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
  ('SA', '00000000-0000-0000-0000-0000000005a1', 'sa5@test.example'),
  ('VA', '00000000-0000-0000-0000-0000000005b1', 'va5@test.example'),
  ('X',  '00000000-0000-0000-0000-0000000005d1', 'x5@test.example');
insert into auth.users (id, email) select id, email from pg_temp.fx;
insert into public.meow_profiles (id, email, role) values
  (pg_temp.u('SA'), 'sa5@test.example', 'system_admin'),
  (pg_temp.u('VA'), 'va5@test.example', 'admin'),
  (pg_temp.u('X'),  'x5@test.example',  'member');
insert into public.meow_admin_module_grants (admin_id, module) values (pg_temp.u('VA'), 'virtual_assets');

insert into public.meow_cat_models (id, name, owner_type, status, photo_path, created_by)
values ('cat_20261030_140731', '第一隻虎斑貓', 'template', 'ready', 'cat_20261030_140731/photo.jpg', pg_temp.u('SA'));

select pg_temp.expect_eq('CM-01 bucket meow-cat-model-photos 存在', '1',
  (select count(*)::text from storage.buckets where id = 'meow-cat-model-photos'));
select pg_temp.expect_eq('CM-02 bucket meow-cat-models 存在', '1',
  (select count(*)::text from storage.buckets where id = 'meow-cat-models'));

select pg_temp.expect_ok('CM-03 virtual_assets 可上架',
  pg_temp.run_as('VA', $q$select public.meow_publish_cat_model('cat_20261030_140731', 'publish', 'Demo 上架')::text$q$));
select pg_temp.expect_eq('CM-04 狀態變 published', 'published',
  (select status from public.meow_cat_models where id = 'cat_20261030_140731'));
select pg_temp.expect_eq('CM-05 稽核 publish_model', 'publish_model',
  (select action from public.meow_audit_logs where target_id = 'cat_20261030_140731' order by id desc limit 1));

select pg_temp.expect_err('CM-06 一般會員不能上架', 'permission_denied',
  pg_temp.run_as('X', $q$select public.meow_publish_cat_model('cat_20261030_140731', 'unpublish', '亂試')::text$q$));

select pg_temp.expect_ok('CM-07 可下架',
  pg_temp.run_as('SA', $q$select public.meow_publish_cat_model('cat_20261030_140731', 'unpublish', '暫時下架')::text$q$));
select pg_temp.expect_eq('CM-08 狀態變 unpublished', 'unpublished',
  (select status from public.meow_cat_models where id = 'cat_20261030_140731'));

select pg_temp.expect_err('CM-09 沒原因拒絕', 'reason_required',
  pg_temp.run_as('VA', $q$select public.meow_publish_cat_model('cat_20261030_140731', 'publish', '  ')::text$q$));

select * from pg_temp.test_results order by n;
rollback;
