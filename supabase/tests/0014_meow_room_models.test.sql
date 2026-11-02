-- MeowHQ 影片轉 3D 房間（#93）資料庫測試：表、權限、bucket。結束 rollback；不要在正式專案執行。
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

insert into public.meow_room_models (id, name, status, video_path, created_by)
values ('room_20261102_120000', '展示房間', 'queued', 'room_20261102_120000/source.mp4', pg_temp.u('SA'));
insert into public.meow_room_jobs (room_id, status) values ('room_20261102_120000', 'queued');

select pg_temp.expect_eq('RM-01 影片 bucket 是私有', 'false',
  (select public::text from storage.buckets where id = 'meow-room-videos'));
select pg_temp.expect_eq('RM-02 成果 bucket 是公開', 'true',
  (select public::text from storage.buckets where id = 'meow-room-models'));

select pg_temp.expect_eq('RM-03 virtual_assets 看得到房間', '1',
  pg_temp.run_as('VA', $q$select count(*)::text from public.meow_room_models$q$));
select pg_temp.expect_eq('RM-04 一般會員看不到房間', '0',
  pg_temp.run_as('X', $q$select count(*)::text from public.meow_room_models$q$));
select pg_temp.expect_err('RM-05 訪客不能讀', 'permission denied',
  pg_temp.run_as(null, $q$select count(*)::text from public.meow_room_models$q$));

select pg_temp.expect_ok('RM-06 virtual_assets 可建立房間',
  pg_temp.run_as('VA', $q$insert into public.meow_room_models (id, name, status) values ('room_20261102_120001', '第二間', 'queued') returning id$q$));
select pg_temp.expect_err('RM-07 一般會員不能建立房間', 'row-level security',
  pg_temp.run_as('X', $q$insert into public.meow_room_models (id, name, status) values ('room_20261102_120002', '亂試', 'queued') returning id$q$));

select pg_temp.expect_err('RM-08 同一間不能有兩筆進行中的工作', 'duplicate key',
  pg_temp.run_as('VA', $q$insert into public.meow_room_jobs (room_id, status) values ('room_20261102_120000', 'queued') returning status$q$));

select * from pg_temp.test_results order by n;
rollback;
