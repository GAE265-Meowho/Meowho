-- MeowHQ｜影片轉 3D 房間（Issue #93）
-- 共用專案規則（AGENTS.md §7）：只建立／修改 meow_ 開頭的物件、meow- 開頭的 bucket、meow: 開頭的 storage policy；可重複執行。
-- ⚠ 執行前須經 Tina 確認（AGENTS.md §7.4）。
-- 決策 006 的大型檔案放 Azure Blob；11/5 MVP 先放 Supabase，video_path、result_path 都只存路徑，之後可搬。
-- 決策 007：原始影片在轉換完成後由 worker 刪除，video_path 改回 null。

-- =========================================================
-- 1. meow_room_models
-- =========================================================
create table if not exists public.meow_room_models (
  id text primary key check (id ~ '^room_[0-9]{8}_[0-9]{6}(_[0-9]+)?$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  status text not null check (status in ('queued', 'running', 'ready', 'failed')),
  video_path text,
  result_path text,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references public.meow_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meow_room_models_status_idx on public.meow_room_models (status, updated_at desc);

-- =========================================================
-- 2. meow_room_jobs
-- =========================================================
create table if not exists public.meow_room_jobs (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.meow_room_models (id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'done', 'error')),
  step text,
  error text,
  worker_id text,
  attempt int not null default 1 check (attempt >= 1),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists meow_room_jobs_room_idx on public.meow_room_jobs (room_id, queued_at desc);
create index if not exists meow_room_jobs_active_idx on public.meow_room_jobs (status) where status in ('queued', 'running');

-- 同一間房間同時只能有一筆 queued／running
create unique index if not exists meow_room_jobs_one_active
  on public.meow_room_jobs (room_id) where status in ('queued', 'running');

-- =========================================================
-- 3. Storage buckets
--    meow-room-videos 是居家影片（決策 007），一定要私有；meow-room-models 放 3D 成果
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meow-room-videos', 'meow-room-videos', false, 52428800, array['video/mp4', 'video/quicktime'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meow-room-models', 'meow-room-models', true, 52428800, null)
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "meow: room videos read virtual_assets" on storage.objects;
create policy "meow: room videos read virtual_assets" on storage.objects for select to authenticated
  using (bucket_id = 'meow-room-videos' and (select public.meow_has_module('virtual_assets')));
drop policy if exists "meow: room videos write virtual_assets" on storage.objects;
create policy "meow: room videos write virtual_assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'meow-room-videos' and (select public.meow_has_module('virtual_assets')));
drop policy if exists "meow: room videos delete virtual_assets" on storage.objects;
create policy "meow: room videos delete virtual_assets" on storage.objects for delete to authenticated
  using (bucket_id = 'meow-room-videos' and (select public.meow_has_module('virtual_assets')));

drop policy if exists "meow: room models public read" on storage.objects;
create policy "meow: room models public read" on storage.objects for select
  using (bucket_id = 'meow-room-models');
drop policy if exists "meow: room models write virtual_assets" on storage.objects;
create policy "meow: room models write virtual_assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'meow-room-models' and (select public.meow_has_module('virtual_assets')));
drop policy if exists "meow: room models update virtual_assets" on storage.objects;
create policy "meow: room models update virtual_assets" on storage.objects for update to authenticated
  using (bucket_id = 'meow-room-models' and (select public.meow_has_module('virtual_assets')))
  with check (bucket_id = 'meow-room-models' and (select public.meow_has_module('virtual_assets')));
drop policy if exists "meow: room models delete virtual_assets" on storage.objects;
create policy "meow: room models delete virtual_assets" on storage.objects for delete to authenticated
  using (bucket_id = 'meow-room-models' and (select public.meow_has_module('virtual_assets')));

-- =========================================================
-- 4. RLS：只有 virtual_assets 管理員能讀寫；worker 用 service role
-- =========================================================
alter table public.meow_room_models enable row level security;
alter table public.meow_room_jobs enable row level security;

revoke all on public.meow_room_models, public.meow_room_jobs from anon, authenticated;
grant select, insert, update, delete on public.meow_room_models, public.meow_room_jobs to authenticated;

drop policy if exists "meow_room_models: virtual_assets" on public.meow_room_models;
create policy "meow_room_models: virtual_assets" on public.meow_room_models for all to authenticated
  using ((select public.meow_has_module('virtual_assets')))
  with check ((select public.meow_has_module('virtual_assets')));

drop policy if exists "meow_room_jobs: virtual_assets" on public.meow_room_jobs;
create policy "meow_room_jobs: virtual_assets" on public.meow_room_jobs for all to authenticated
  using ((select public.meow_has_module('virtual_assets')))
  with check ((select public.meow_has_module('virtual_assets')));
