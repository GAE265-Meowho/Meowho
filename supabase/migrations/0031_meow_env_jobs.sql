-- WelfareLens / Meowho Worker contract v0.4 foundation.
-- This migration is intentionally additive. The atomic scheduling RPC below is a
-- new main-site adapter proposed by PR A; it does not replace existing RPCs.

create table if not exists public.meow_home_videos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.meow_households (id) on delete cascade,
  path text not null unique check (path ~ '^homes/[0-9a-fA-F-]{36}/videos/[0-9a-fA-F-]{36}\.(mp4|mov)$'),
  purpose text not null check (purpose in ('room', 'safety')),
  status text not null default 'uploading' check (status in ('uploading', 'uploaded')),
  size_bytes bigint check (size_bytes is null or size_bytes between 1 and 314572800),
  duration_s numeric check (duration_s is null or duration_s between 0 and 180),
  uploaded_at timestamptz,
  raw_deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists meow_home_videos_cleanup_idx
  on public.meow_home_videos (status, raw_deleted_at, uploaded_at);

alter table public.meow_env_reports add column if not exists video_id uuid references public.meow_home_videos (id) on delete set null;
alter table public.meow_env_reports add column if not exists warnings jsonb not null default '[]'::jsonb;
alter table public.meow_env_reports add column if not exists json_path text;
alter table public.meow_env_reports add column if not exists pdf_path text;
alter table public.meow_env_reports add column if not exists attempt int;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'meow_env_reports_warnings_array_check') then
    alter table public.meow_env_reports add constraint meow_env_reports_warnings_array_check
      check (jsonb_typeof(warnings) = 'array' and pg_column_size(warnings) <= 100000);
  end if;
end $$;
create unique index if not exists meow_env_reports_video_unique
  on public.meow_env_reports (video_id) where video_id is not null;

create table if not exists public.meow_env_jobs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.meow_env_reports (id) on delete set null,
  -- Keep canceled tombstones after owner/household/source deletion so Worker
  -- callbacks can distinguish cancellation from an unknown job.
  report_storage_prefix text not null check (report_storage_prefix ~ '^homes/[0-9a-fA-F-]{36}/reports/[0-9a-fA-F-]{36}/$'),
  household_id uuid references public.meow_households (id) on delete set null,
  video_id uuid references public.meow_home_videos (id) on delete set null,
  room_job_id uuid references public.meow_room_jobs (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'canceled')),
  attempt int not null default 0 check (attempt >= 0),
  max_attempts int not null default 3 check (max_attempts between 1 and 10),
  lease_until timestamptz,
  worker_id text,
  step text,
  error_code text,
  error_detail text check (error_detail is null or char_length(error_detail) <= 500),
  retryable boolean,
  result_json_path text,
  result_pdf_path text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
alter table public.meow_env_jobs alter column household_id drop not null;
alter table public.meow_env_jobs alter column video_id drop not null;
create index if not exists meow_env_jobs_queue_idx on public.meow_env_jobs (status, queued_at);
create unique index if not exists meow_env_jobs_one_active_video
  on public.meow_env_jobs (video_id) where status in ('queued', 'running');

-- Idempotency belongs to the scheduling request, not just the video: an
-- explicitly new request may requeue a terminal failure without duplicating
-- work if that same HTTP request is retried.
create table if not exists public.meow_home_processing_requests (
  request_id uuid primary key,
  video_id uuid not null references public.meow_home_videos (id) on delete cascade,
  env_job_id uuid not null references public.meow_env_jobs (id) on delete cascade,
  room_job_id uuid references public.meow_room_jobs (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.meow_home_videos enable row level security;
alter table public.meow_env_jobs enable row level security;
alter table public.meow_home_processing_requests enable row level security;
revoke all on public.meow_home_videos, public.meow_env_jobs from anon, authenticated;
revoke all on public.meow_home_processing_requests from anon, authenticated;
grant select, insert, update, delete on public.meow_home_videos, public.meow_env_jobs to service_role;
grant select, insert, update, delete on public.meow_home_processing_requests to service_role;

create or replace function public.meow_env_path_ok(p_path text, p_household uuid, p_video uuid)
returns boolean language sql immutable security definer set search_path = pg_catalog, public as $$
  select p_household is not null and p_video is not null and (
       p_path = pg_catalog.format('homes/%s/videos/%s.mp4', p_household, p_video)
    or p_path = pg_catalog.format('homes/%s/videos/%s.mov', p_household, p_video))
$$;

-- Proposed PR A interface: one idempotent transaction creates report + env job,
-- and (for purpose=room) the existing 3D job. Repeating with the same video id
-- returns the existing active/result rows without creating duplicates.
create or replace function public.meow_create_home_processing(p_video_id uuid, p_room_id text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v public.meow_home_videos; r public.meow_env_reports; e public.meow_env_jobs; room_job public.meow_room_jobs; req public.meow_home_processing_requests;
begin
  if p_request_id is null then raise exception 'env_request_invalid'; end if;
  select * into req from public.meow_home_processing_requests where request_id=p_request_id;
  if found then
    if req.video_id is distinct from p_video_id then raise exception 'env_request_conflict'; end if;
    select * into e from public.meow_env_jobs where id=req.env_job_id;
    select * into r from public.meow_env_reports where id=e.report_id;
    if r.id is not null and r.room_model_id is distinct from p_room_id then raise exception 'env_request_conflict'; end if;
    return jsonb_build_object('video_id', req.video_id, 'report_id', r.id, 'env_job_id', e.id, 'room_job_id', req.room_job_id);
  end if;
  select * into v from public.meow_home_videos where id = p_video_id for update;
  if not found then raise exception 'env_source_not_found'; end if;
  if v.status <> 'uploaded' or v.raw_deleted_at is not null or not public.meow_env_path_ok(v.path, v.household_id, v.id) then
    raise exception 'env_source_invalid';
  end if;
  if v.purpose = 'room' and p_room_id is null then raise exception 'env_room_required'; end if;
  if v.purpose = 'room' and not exists (select 1 from public.meow_room_models m where m.id = p_room_id and m.video_path = v.path) then
    raise exception 'env_room_not_found';
  end if;
  select * into r from public.meow_env_reports where video_id = p_video_id limit 1;
  if found and r.room_model_id is distinct from p_room_id then raise exception 'env_request_conflict'; end if;
  if found then
    select * into e from public.meow_env_jobs where video_id = p_video_id order by queued_at desc limit 1;
    if e.status in ('queued','running') then
      room_job.id := e.room_job_id;
      insert into public.meow_home_processing_requests(request_id,video_id,env_job_id,room_job_id)
      values(p_request_id,p_video_id,e.id,e.room_job_id);
      return jsonb_build_object('video_id', p_video_id, 'report_id', r.id, 'env_job_id', e.id, 'room_job_id', e.room_job_id);
    end if;
    if e.status is distinct from 'failed' then raise exception 'env_request_conflict'; end if;
    if e.error_code is null or e.error_code not in ('config_error','permission_denied','result_invalid','lease_expired') then raise exception 'env_job_not_requeueable'; end if;
  else
    insert into public.meow_env_reports (household_id, room_model_id, video_id, status)
      values (v.household_id, p_room_id, p_video_id, 'queued') returning * into r;
  end if;
  if v.purpose = 'room' then
    select * into room_job from public.meow_room_jobs where room_id=p_room_id and status in ('queued','running') order by queued_at desc limit 1;
    if not found then
      insert into public.meow_room_jobs (room_id, status) values (p_room_id, 'queued') returning * into room_job;
    end if;
  end if;
  insert into public.meow_env_jobs (report_id, report_storage_prefix, household_id, video_id)
    values (r.id, pg_catalog.format('homes/%s/reports/%s/', v.household_id, r.id), v.household_id, v.id) returning * into e;
  update public.meow_env_jobs set room_job_id=room_job.id where id=e.id returning * into e;
  update public.meow_env_reports set status='queued', error=null, ready_at=null where id=r.id;
  insert into public.meow_home_processing_requests(request_id,video_id,env_job_id,room_job_id)
    values(p_request_id,p_video_id,e.id,room_job.id);
  return jsonb_build_object('video_id', p_video_id, 'report_id', r.id, 'env_job_id', e.id, 'room_job_id', room_job.id);
end $$;

create or replace function public.meow_env_claim(p_worker text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare j public.meow_env_jobs; v public.meow_home_videos; r public.meow_env_reports; next_attempt int;
begin
  loop
    select * into j from public.meow_env_jobs where (status = 'queued' or (status = 'running' and lease_until < now())) order by queued_at for update skip locked limit 1;
    if not found then return null; end if;
    if j.status = 'running' and j.attempt >= j.max_attempts then
      update public.meow_env_jobs set status='failed', error_code='lease_expired', retryable=false, finished_at=now(), lease_until=null where id=j.id;
      update public.meow_env_reports set status='failed', error='處理租約已過期，重試次數已用完' where id=j.report_id;
      continue;
    end if;
    select * into v from public.meow_home_videos where id = j.video_id for update;
    if not found or v.status <> 'uploaded' or v.raw_deleted_at is not null or not public.meow_env_path_ok(v.path, v.household_id, v.id) then
      update public.meow_env_jobs set status='failed', error_code='source_invalid', retryable=false, finished_at=now() where id=j.id;
      update public.meow_env_reports set status='failed', error='來源影片無效' where id=j.report_id;
      continue;
    end if;
    next_attempt := j.attempt + 1;
    update public.meow_env_jobs set status='running', attempt=next_attempt, lease_until=now()+interval '10 minutes', worker_id=p_worker, started_at=coalesce(started_at, now()), step='claimed' where id=j.id returning * into j;
    update public.meow_env_reports set status='running' where id=j.report_id;
    select * into r from public.meow_env_reports where id=j.report_id;
    return jsonb_build_object('job_id', j.id, 'attempt', j.attempt, 'report_id', j.report_id, 'household_id', j.household_id, 'video_id', j.video_id, 'video_path', v.path, 'output_prefix', pg_catalog.format('%sa%s/', j.report_storage_prefix, j.attempt), 'lease_until', j.lease_until);
  end loop;
end $$;

create or replace function public.meow_env_renew(p_job uuid, p_attempt int, p_step text)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public as $$
declare until_at timestamptz; j public.meow_env_jobs;
begin
  select * into j from public.meow_env_jobs where id=p_job for update;
  if not found then raise exception 'env_job_not_found'; end if;
  if j.status='canceled' then raise exception 'env_job_canceled'; end if;
  if j.attempt<>p_attempt then raise exception 'env_attempt_stale'; end if;
  if j.status<>'running' then raise exception 'env_job_not_running'; end if;
  if j.lease_until is null or j.lease_until <= pg_catalog.now() then raise exception 'env_lease_expired'; end if;
  update public.meow_env_jobs set lease_until=pg_catalog.now()+interval '10 minutes', step=p_step where id=p_job returning lease_until into until_at;
  return until_at;
end $$;

create or replace function public.meow_env_complete(p_job uuid, p_attempt int, p_summary text, p_items jsonb, p_warnings jsonb, p_json_path text, p_pdf_path text)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare j public.meow_env_jobs; prefix text; item jsonb; item_key text; seen_keys text[] := '{}'; warn jsonb; item_count int; warning_count int; field_count int;
begin
  select * into j from public.meow_env_jobs where id=p_job for update;
  if not found then raise exception 'env_job_not_found'; end if;
  if j.status='canceled' then raise exception 'env_job_canceled'; end if;
  if j.status='done' and j.attempt=p_attempt and j.result_json_path=p_json_path and j.result_pdf_path=p_pdf_path then return 'already_done'; end if;
  if j.attempt<>p_attempt then raise exception 'env_attempt_stale'; end if;
  if j.status<>'running' then raise exception 'env_job_not_running'; end if;
  if j.lease_until is null or j.lease_until <= pg_catalog.now() then raise exception 'env_lease_expired'; end if;
  if j.household_id is null or j.report_id is null or p_summary is null or pg_catalog.char_length(pg_catalog.btrim(p_summary)) not between 1 and 2000
     or jsonb_typeof(p_items) is distinct from 'array' or jsonb_typeof(p_warnings) is distinct from 'array'
     or pg_catalog.pg_column_size(p_items)>100000 or pg_catalog.pg_column_size(p_warnings)>100000 then raise exception 'env_result_invalid'; end if;
  item_count := jsonb_array_length(p_items); warning_count := jsonb_array_length(p_warnings);
  if item_count > 30 or warning_count > 10 then raise exception 'env_result_invalid'; end if;
  prefix := pg_catalog.format('homes/%s/reports/%s/a%s/', j.household_id, j.report_id, j.attempt);
  if p_json_path is distinct from prefix || 'result.json' or p_pdf_path is distinct from prefix || 'report.pdf' then raise exception 'env_result_invalid'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item)<>'object' then raise exception 'env_result_invalid'; end if;
    select count(*) into field_count from jsonb_object_keys(item);
    if not (item ?& array['key','label','level','note']) or field_count not between 4 and 5
       or exists (select 1 from jsonb_object_keys(item) k where k not in ('key','label','level','note','crop_path')) then raise exception 'env_result_invalid'; end if;
    if jsonb_typeof(item->'key') is distinct from 'string' or jsonb_typeof(item->'label') is distinct from 'string' or jsonb_typeof(item->'level') is distinct from 'string' or jsonb_typeof(item->'note') is distinct from 'string' then raise exception 'env_result_invalid'; end if;
    item_key := item->>'key';
    if item_key !~ '^[A-Za-z0-9_]{1,60}$' or item_key = any(seen_keys)
       or pg_catalog.char_length(pg_catalog.btrim(item->>'label')) not between 1 and 20
       or item->>'level' not in ('high','medium','low')
       or pg_catalog.char_length(pg_catalog.btrim(item->>'note')) not between 1 and 200 then raise exception 'env_result_invalid'; end if;
    seen_keys := pg_catalog.array_append(seen_keys,item_key);
    if item ? 'crop_path' and item->'crop_path'<>'null'::jsonb then
      if jsonb_typeof(item->'crop_path')<>'string' or item->>'crop_path' <> prefix || 'crops/' || item_key || '.jpg' then raise exception 'env_result_invalid'; end if;
    end if;
  end loop;
  for warn in select value from jsonb_array_elements(p_warnings) loop
    if jsonb_typeof(warn)<>'object' then raise exception 'env_result_invalid'; end if;
    select count(*) into field_count from jsonb_object_keys(warn);
    if not (warn ?& array['code','message']) or field_count<>2
       or jsonb_typeof(warn->'code') is distinct from 'string' or jsonb_typeof(warn->'message') is distinct from 'string'
       or (warn->>'code') !~ '^[A-Za-z0-9_]{1,40}$'
       or pg_catalog.char_length(pg_catalog.btrim(warn->>'message')) not between 1 and 100 then raise exception 'env_result_invalid'; end if;
  end loop;
  update public.meow_env_jobs set status='done', finished_at=now(), lease_until=null, result_json_path=p_json_path, result_pdf_path=p_pdf_path where id=p_job;
  update public.meow_env_reports set status='ready', summary=p_summary, items=p_items, warnings=p_warnings, json_path=p_json_path, pdf_path=p_pdf_path, attempt=p_attempt, ready_at=now() where id=j.report_id;
  return 'done';
end $$;

create or replace function public.meow_env_fail(p_job uuid, p_attempt int, p_code text, p_detail text, p_retryable boolean)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare j public.meow_env_jobs; can_retry boolean;
begin
  select * into j from public.meow_env_jobs where id=p_job for update;
  if not found then raise exception 'env_job_not_found'; end if;
  if p_code is null or p_code not in ('network','rate_limited','service_unavailable','timeout','video_format','video_too_long','video_too_large','video_unreadable','video_not_indoor','source_invalid','config_error','permission_denied','result_invalid','lease_expired') then raise exception 'env_result_invalid'; end if;
  if j.status='canceled' then raise exception 'env_job_canceled'; end if;
  if j.attempt<>p_attempt then raise exception 'env_attempt_stale'; end if;
  if j.status='queued' and j.retryable and j.error_code=p_code then return 'requeued'; end if;
  if j.status='failed' then return case when j.retryable then 'requeued' else 'failed' end; end if;
  if j.status<>'running' then raise exception 'env_job_not_running'; end if;
  if j.lease_until is null or j.lease_until <= pg_catalog.now() then raise exception 'env_lease_expired'; end if;
  can_retry := p_retryable and p_code in ('network','rate_limited','service_unavailable','timeout') and j.attempt < j.max_attempts;
  if can_retry then
    update public.meow_env_jobs set status='queued', lease_until=null, error_code=p_code, error_detail=left(p_detail,500), retryable=true where id=p_job;
    update public.meow_env_reports set status='queued' where id=j.report_id;
    return 'requeued';
  end if;
  update public.meow_env_jobs set status='failed', finished_at=now(), lease_until=null, error_code=p_code, error_detail=left(p_detail,500), retryable=false where id=p_job;
  update public.meow_env_reports set status='failed', error=left(p_detail,2000) where id=j.report_id;
  return 'failed';
end $$;

-- Preserve terminal tombstones so late Worker callbacks receive env_job_canceled.
create or replace function public.meow_env_cancel_on_report_delete()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.meow_env_jobs
     set status='canceled', report_id=null, lease_until=null, retryable=false, finished_at=pg_catalog.now()
   where report_id=old.id and status in ('queued','running');
  return old;
end $$;

create or replace function public.meow_env_cancel_on_household_delete()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.meow_env_jobs
     set status='canceled', report_id=null, lease_until=null, retryable=false, finished_at=pg_catalog.now()
   where household_id=old.id and status in ('queued','running');
  return old;
end $$;

create or replace function public.meow_env_cancel_on_video_delete()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.meow_env_jobs
     set status='canceled', report_id=null, lease_until=null, retryable=false, finished_at=pg_catalog.now()
   where video_id=old.id and status in ('queued','running');
  return old;
end $$;

drop trigger if exists meow_env_reports_cancel_jobs on public.meow_env_reports;
create trigger meow_env_reports_cancel_jobs before delete on public.meow_env_reports
for each row execute function public.meow_env_cancel_on_report_delete();
drop trigger if exists meow_households_cancel_env_jobs on public.meow_households;
create trigger meow_households_cancel_env_jobs before delete on public.meow_households
for each row execute function public.meow_env_cancel_on_household_delete();
drop trigger if exists meow_home_videos_cancel_env_jobs on public.meow_home_videos;
create trigger meow_home_videos_cancel_env_jobs before delete on public.meow_home_videos
for each row execute function public.meow_env_cancel_on_video_delete();

revoke all on function public.meow_env_path_ok(text, uuid, uuid), public.meow_create_home_processing(uuid, text, uuid), public.meow_env_claim(text), public.meow_env_renew(uuid, int, text), public.meow_env_complete(uuid, int, text, jsonb, jsonb, text, text), public.meow_env_fail(uuid, int, text, text, boolean), public.meow_env_cancel_on_report_delete(), public.meow_env_cancel_on_household_delete(), public.meow_env_cancel_on_video_delete() from public, anon, authenticated;
grant execute on function public.meow_create_home_processing(uuid, text, uuid), public.meow_env_claim(text), public.meow_env_renew(uuid, int, text), public.meow_env_complete(uuid, int, text, jsonb, jsonb, text, text), public.meow_env_fail(uuid, int, text, text, boolean) to service_role;
