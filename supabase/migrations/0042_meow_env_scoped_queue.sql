-- Empty by default. Only a database administrator can approve a household.
create table if not exists public.meow_env_queue_households (
  household_id uuid primary key references public.meow_households(id) on delete cascade,
  approved_from timestamptz not null default now()
);
alter table public.meow_env_queue_households enable row level security;
revoke all on public.meow_env_queue_households from public, anon, authenticated, service_role;

alter table public.meow_env_jobs add column if not exists model_reserved_at timestamptz;
create index if not exists meow_env_jobs_household_claim_idx
  on public.meow_env_jobs (household_id, queued_at, id) where status in ('queued','running');

create or replace function public.meow_env_claim_household(p_worker text, p_household uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  scope_from timestamptz;
  j public.meow_env_jobs;
  failure text;
  lease_time timestamptz;
begin
  if p_worker is null or length(btrim(p_worker)) not between 1 and 200 then
    raise exception 'env_scope_denied';
  end if;
  select approved_from into scope_from from public.meow_env_queue_households
    where household_id=p_household for share;
  if not found then raise exception 'env_scope_denied'; end if;

  loop
    select q.* into j from public.meow_env_jobs q
      where q.household_id=p_household and q.queued_at>=scope_from
        and (q.status='queued' or (q.status='running' and q.lease_until<=clock_timestamp()))
      order by q.queued_at, q.id limit 1 for update of q skip locked;
    if not found then return null; end if;

    failure := null;
    if j.attempt>=j.max_attempts or j.model_reserved_at is not null then
      failure := 'lease_expired';
    elsif j.report_storage_prefix is distinct from format('homes/%s/reports/%s/',p_household,j.report_id)
       or not exists (select 1 from public.meow_home_videos v
         where v.id=j.video_id and v.household_id=p_household and v.status='uploaded'
           and v.raw_deleted_at is null and v.path=j.video_path
           and public.meow_env_path_ok(v.path,v.household_id,v.id) for share of v nowait)
       or not exists (select 1 from public.meow_env_reports r
         where r.id=j.report_id and r.household_id=p_household and r.video_id=j.video_id for no key update of r nowait) then
      failure := 'source_invalid';
    end if;

    if failure is not null then
      update public.meow_env_jobs set status='failed', error_code=failure, retryable=false,
        finished_at=clock_timestamp(), lease_until=null where id=j.id;
      update public.meow_env_reports set status='failed', error=public.meow_env_user_error(failure)
        where id=j.report_id and household_id=p_household and video_id=j.video_id;
      continue;
    end if;

    lease_time := clock_timestamp()+interval '10 minutes';
    update public.meow_env_jobs set status='running', attempt=attempt+1, lease_until=lease_time,
      worker_id=p_worker, started_at=coalesce(started_at,clock_timestamp()), step='claimed'
      where id=j.id returning * into j;
    update public.meow_env_reports set status='running' where id=j.report_id;
    return jsonb_build_object('job_id',j.id,'attempt',j.attempt,'report_id',j.report_id,
      'household_id',j.household_id,'video_id',j.video_id,'video_path',j.video_path,
      'output_prefix',format('%sa%s/',j.report_storage_prefix,j.attempt),'lease_until',lease_time);
  end loop;
exception when lock_not_available then
  -- A concurrent source/report edit holds the lock. Wait for the next poll.
  return null;
end $$;

-- One durable model budget per job, across leases and container restarts.
create or replace function public.meow_env_reserve_models(p_job uuid, p_attempt int, p_worker text, p_household uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare scope_from timestamptz;
begin
  if p_household is not null then
    select approved_from into scope_from from public.meow_env_queue_households
      where household_id=p_household for share;
    if not found then return false; end if;
  end if;
  update public.meow_env_jobs set model_reserved_at=clock_timestamp()
    where id=p_job and attempt=p_attempt and worker_id=p_worker and status='running'
      and lease_until>clock_timestamp() and model_reserved_at is null
      and (p_household is null or (household_id=p_household and queued_at>=scope_from));
  return found;
end $$;

revoke all on function public.meow_env_claim_household(text, uuid),
  public.meow_env_reserve_models(uuid, int, text, uuid) from public, anon, authenticated;
grant execute on function public.meow_env_claim_household(text, uuid),
  public.meow_env_reserve_models(uuid, int, text, uuid) to service_role;
