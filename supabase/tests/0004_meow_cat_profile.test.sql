-- 貓咪 profile（#57、規格 #72）資料庫測試：年齡層、標籤、多張照片、貓影片表與權限。
-- 執行方式：node supabase/tests/run-pglite.mjs（建議，完全不連 Supabase）；或本機 Supabase 以 psql 執行本檔。
-- ⚠ 會寫入測試資料（結束時 rollback），**不要在正式 Supabase 專案執行**。
-- 固定角色：O 喵戶長；X 其他會員；匿名訪客用 run_as(null, …)。輔助函式與 0003 測試相同。

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
  ('O', '00000000-0000-0000-0000-0000000004a1', 'o4@test.example'),
  ('X', '00000000-0000-0000-0000-0000000004b1', 'x4@test.example');
insert into auth.users (id, email) select id, email from pg_temp.fx;
insert into public.meow_profiles (id, email) select id, email from pg_temp.fx;
insert into public.meow_households (id, owner_id, name, caretaker_type, city, district)
  values ('00000000-0000-0000-0000-0000000004c1', pg_temp.u('O'), '小橘之家', 'personal_foster', '台中市', '北屯區');

create function pg_temp.new_cat(p_extra text default '') returns text language sql as $fn$
  select pg_temp.run_as('O', format(
    $q$insert into public.meow_cats (household_id, name, sex, life_stage %s) values ('00000000-0000-0000-0000-0000000004c1', '橘子', 'unknown', 'young_adult' %s) returning id::text$q$,
    case when p_extra = '' then '' else ', ' || split_part(p_extra, '=', 1) end,
    case when p_extra = '' then '' else ', ' || split_part(p_extra, '=', 2) end))
$fn$;

-- ---------------------------------------------------------------- 貓咪新欄位
select pg_temp.expect_ok('CAT-01 喵戶長可以建立有年齡層的貓', pg_temp.new_cat());
create temp table c1 as select id from public.meow_cats where name = '橘子' limit 1;
select pg_temp.expect_eq('CAT-02 新建的貓預設為待領養', 'adoptable', (select status from public.meow_cats where id = (select id from c1)));
select pg_temp.expect_eq('CAT-03 標籤與照片預設為空陣列', '{}|{}|{}',
  (select personality_tags::text || '|' || health_tags::text || '|' || photo_paths::text from public.meow_cats where id = (select id from c1)));
select pg_temp.expect_err('CAT-04 新建的貓一定要有年齡層', 'life_stage_required',
  pg_temp.run_as('O', $q$insert into public.meow_cats (household_id, name, sex) values ('00000000-0000-0000-0000-0000000004c1', '沒年齡', 'unknown') returning id::text$q$));
select pg_temp.expect_err('CAT-05 年齡層只接受四級代號', 'meow_cats_life_stage_check',
  pg_temp.run_as('O', $q$insert into public.meow_cats (household_id, name, sex, life_stage) values ('00000000-0000-0000-0000-0000000004c1', '壯壯', 'unknown', 'adult') returning id::text$q$));
select pg_temp.expect_err('CAT-06 照片最多 5 張', 'meow_cats_photo_paths_check',
  pg_temp.new_cat($v$photo_paths='{a,b,c,d,e,f}'$v$));
select pg_temp.expect_ok('CAT-07 5 張照片可以', pg_temp.new_cat($v$photo_paths='{a,b,c,d,e}'$v$));
select pg_temp.expect_ok('CAT-08 可存個性、健康標籤與原文描述',
  pg_temp.run_as('O', format($q$update public.meow_cats set personality_tags = '{親人,愛玩}', health_tags = '{已結紮}', description = '很親人' where id = '%s' returning id::text$q$, (select id from c1))));
select pg_temp.expect_eq('CAT-11 時間軸預設為空陣列', '[]',
  (select timeline::text from public.meow_cats where id = (select id from c1)));
select pg_temp.expect_ok('CAT-12 可存時間軸（日期＋事件）',
  pg_temp.run_as('O', format($q$update public.meow_cats set timeline = '[{"date":"2026-08-01","event":"在永寧站接麥麥"}]' where id = '%s' returning id::text$q$, (select id from c1))));
select pg_temp.expect_err('CAT-13 時間軸必須是陣列', 'meow_cats_timeline_check',
  pg_temp.run_as('O', format($q$update public.meow_cats set timeline = '{"date":"2026-08-01"}' where id = '%s' returning id::text$q$, (select id from c1))));
select pg_temp.expect_err('CAT-14 時間軸最多 50 筆', 'meow_cats_timeline_check',
  pg_temp.run_as('O', format($q$update public.meow_cats set timeline = (select jsonb_agg(jsonb_build_object('date','2026-01-01','event','x')) from generate_series(1,51)) where id = '%s' returning id::text$q$, (select id from c1))));
select pg_temp.expect_eq('CAT-09 其他會員不能修改別人的貓', '0',
  pg_temp.run_as('X', format($q$with u as (update public.meow_cats set name = '偷改' where id = '%s' returning 1) select count(*)::text from u$q$, (select id from c1))));
select pg_temp.expect_eq('CAT-10 匿名訪客讀得到待領養貓', '1',
  pg_temp.run_as(null, format($q$select count(*)::text from public.meow_cats where id = '%s'$q$, (select id from c1))));

-- ---------------------------------------------------------------- 貓影片
select pg_temp.expect_ok('VID-01 喵戶長可以替自己的貓新增影片',
  pg_temp.run_as('O', format($q$insert into public.meow_cat_videos (cat_id, storage_path, duration_sec) values ('%s', 'cats/c1/videos/1.mp4', 30) returning id::text$q$, (select id from c1))));
select pg_temp.expect_err('VID-04 其他會員不能替別人的貓新增影片', 'row-level security',
  pg_temp.run_as('X', format($q$insert into public.meow_cat_videos (cat_id, storage_path, duration_sec) values ('%s', 'cats/c1/videos/5.mp4', 10) returning id::text$q$, (select id from c1))));
select pg_temp.expect_err('VID-02 影片最多 60 秒', 'meow_cat_videos_duration_sec_check',
  pg_temp.run_as('O', format($q$insert into public.meow_cat_videos (cat_id, storage_path, duration_sec) values ('%s', 'cats/c1/videos/x.mp4', 61) returning id::text$q$, (select id from c1))));
select pg_temp.run_as('O', format($q$insert into public.meow_cat_videos (cat_id, storage_path, duration_sec) values ('%1$s', 'cats/c1/videos/2.mp4', 20), ('%1$s', 'cats/c1/videos/3.mp4', 20) returning 1::text$q$, (select id from c1)));
select pg_temp.expect_err('VID-03 每隻貓最多 3 支影片', 'video_limit',
  pg_temp.run_as('O', format($q$insert into public.meow_cat_videos (cat_id, storage_path, duration_sec) values ('%s', 'cats/c1/videos/4.mp4', 10) returning id::text$q$, (select id from c1))));
select pg_temp.expect_eq('VID-05 匿名訪客讀得到待領養貓的影片', '3',
  pg_temp.run_as(null, format($q$select count(*)::text from public.meow_cat_videos where cat_id = '%s'$q$, (select id from c1))));
select pg_temp.expect_eq('VID-06 其他會員不能刪別人的影片', '0',
  pg_temp.run_as('X', $q$with d as (delete from public.meow_cat_videos returning 1) select count(*)::text from d$q$));
select pg_temp.run_as('O', format($q$with d as (delete from public.meow_cats where id = '%s' returning 1) select count(*)::text from d$q$, (select id from c1)));
select pg_temp.expect_eq('VID-07 刪除貓時影片紀錄一起刪除', '0',
  (select count(*)::text from public.meow_cat_videos where cat_id = (select id from c1)));

-- ---------------------------------------------------------------- 命名
select pg_temp.expect_eq('CAT-30 public 的資料表全部 meow_ 開頭', '0',
  (select count(*)::text from pg_tables where schemaname = 'public' and tablename not like 'meow\_%'));
select pg_temp.expect_eq('CAT-31 public 的函式全部 meow_ 開頭', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not like 'meow\_%'));
select pg_temp.expect_eq('CAT-32 meow_cat_videos 已啟用 RLS', 'true',
  (select relrowsecurity::text from pg_class where oid = 'public.meow_cat_videos'::regclass));

select status, name, detail from pg_temp.test_results order by n;

rollback;
