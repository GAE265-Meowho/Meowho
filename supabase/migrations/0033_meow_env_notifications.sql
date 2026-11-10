-- #326: notify the owning household only when an environment job first enters
-- a terminal state. Keep the idempotency key on the notification itself so
-- repeated status updates cannot create duplicate in-app messages.

alter table public.meow_notifications
  add column if not exists dedupe_key text;

create unique index if not exists meow_notifications_dedupe_idx
  on public.meow_notifications (dedupe_key)
  where dedupe_key is not null;

create or replace function public.meow_notify_env_job_terminal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  household_owner uuid;
  notification_type text;
  notification_title text;
  notification_body text;
begin
  if old.status is not distinct from new.status
     or new.status not in ('done', 'failed')
     or new.household_id is null
     or new.report_id is null then
    return new;
  end if;

  -- Resolve the recipient through this job's report and household, never by
  -- scanning owners or accepting a user id from the Worker.
  select h.owner_id
    into household_owner
    from public.meow_env_reports r
    join public.meow_households h on h.id = r.household_id
   where r.id = new.report_id
     and r.household_id = new.household_id;

  if household_owner is null then
    return new;
  end if;

  if new.status = 'done' then
    notification_type := 'home_safety_ready';
    notification_title := '你家的安全報告好了';
    notification_body := null;
  else
    notification_type := 'home_safety_failed';
    notification_title := '安全報告沒有產生成功';
    notification_body := '請稍後重新檢測；若畫面提示影片不符合拍攝須知，再重新拍攝即可。';
  end if;

  insert into public.meow_notifications (user_id, type, title, body, link, dedupe_key)
  values (
    household_owner,
    notification_type,
    notification_title,
    notification_body,
    pg_catalog.format('/homes/%s/safety', new.household_id),
    pg_catalog.format('env_job:%s:%s', new.id, new.status)
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return new;
end
$$;

revoke all on function public.meow_notify_env_job_terminal() from public, anon, authenticated, service_role;

drop trigger if exists meow_env_jobs_notify_terminal on public.meow_env_jobs;
create trigger meow_env_jobs_notify_terminal
  after update of status on public.meow_env_jobs
  for each row
  when (old.status is distinct from new.status and new.status in ('done', 'failed'))
  execute function public.meow_notify_env_job_terminal();
