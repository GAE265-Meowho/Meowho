-- MeowHQ｜虛擬體驗貓咪模型（Issue #75，規格書 04 §3）
-- 共用專案規則（AGENTS.md §7）：只建立／修改 meow_ 開頭的物件、meow- 開頭的 bucket、meow: 開頭的 storage policy；可重複執行。
-- ⚠ 執行前須經 Tina 確認（AGENTS.md §7.4）。
-- 編號：規格草案寫 0004，但 0004 已用於 meow_cat_profile，故本檔為 0005。
-- id 使用 Cat Studio 風格文字 id（cat_YYYYMMDD_HHMMSS），與現有 /MeowHQ/assets/cats/<id> 網址相容。

-- =========================================================
-- 1. 稽核動作
-- =========================================================
alter table public.meow_audit_logs drop constraint if exists meow_audit_logs_action_check;
alter table public.meow_audit_logs add constraint meow_audit_logs_action_check check (action in (
  'suspend', 'unsuspend', 'revoke_grant', 'revoke_badge', 'takedown', 'relist', 'ban', 'unban',
  'grant_module', 'grant_badge', 'set_role', 'update_setting',
  'generate_model', 'publish_model', 'unpublish_model', 'delete_model', 'restore_texture'));

-- =========================================================
-- 2. meow_cat_models
-- =========================================================
create table if not exists public.meow_cat_models (
  id text primary key check (id ~ '^cat_[0-9]{8}_[0-9]{6}(_[0-9]+)?$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  owner_type text not null check (owner_type in ('template', 'member')),
  owner_id uuid references public.meow_profiles (id) on delete set null,
  status text not null check (status in ('draft', 'queued', 'running', 'ready', 'failed', 'published', 'unpublished')),
  profile jsonb not null default '{}'::jsonb,
  photo_path text not null,
  photo_view text check (photo_view is null or photo_view in ('front', 'left', 'right')),
  fill_pattern text check (fill_pattern is null or fill_pattern in ('none', 'tabby')),
  albedo_path text,
  prev_albedo_path text,
  glb_path text,
  base_version text,
  clip_library_version int,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references public.meow_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (owner_type <> 'member' or owner_id is not null),
  check (owner_type <> 'template' or owner_id is null)
);
create index if not exists meow_cat_models_status_idx on public.meow_cat_models (status, updated_at desc);
create index if not exists meow_cat_models_owner_idx on public.meow_cat_models (owner_type, owner_id);

-- =========================================================
-- 3. meow_cat_model_jobs
-- =========================================================
create table if not exists public.meow_cat_model_jobs (
  id uuid primary key default gen_random_uuid(),
  model_id text not null references public.meow_cat_models (id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'done', 'error')),
  step text,
  view text check (view is null or view in ('front', 'left', 'right')),
  fill text check (fill is null or fill in ('none', 'tabby')),
  error text,
  worker_id text,
  attempt int not null default 1 check (attempt >= 1),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists meow_cat_model_jobs_model_idx on public.meow_cat_model_jobs (model_id, queued_at desc);
create index if not exists meow_cat_model_jobs_active_idx on public.meow_cat_model_jobs (status) where status in ('queued', 'running');

-- 同一模型同時只能有一筆 queued／running
create unique index if not exists meow_cat_model_jobs_one_active
  on public.meow_cat_model_jobs (model_id) where status in ('queued', 'running');

-- =========================================================
-- 4. Storage buckets
--    meow-cat-photos 已存在（貓戶照片，公開），不可改成私有 → 虛擬體驗用新 bucket
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meow-cat-model-photos', 'meow-cat-model-photos', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meow-cat-models', 'meow-cat-models', true, 52428800,
  array['image/png', 'model/gltf-binary', 'application/octet-stream']
)
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "meow: cat model photos read virtual_assets" on storage.objects;
create policy "meow: cat model photos read virtual_assets" on storage.objects for select to authenticated
  using (bucket_id = 'meow-cat-model-photos' and (select public.meow_has_module('virtual_assets')));
drop policy if exists "meow: cat model photos write virtual_assets" on storage.objects;
create policy "meow: cat model photos write virtual_assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'meow-cat-model-photos' and (select public.meow_has_module('virtual_assets')));
drop policy if exists "meow: cat model photos update virtual_assets" on storage.objects;
create policy "meow: cat model photos update virtual_assets" on storage.objects for update to authenticated
  using (bucket_id = 'meow-cat-model-photos' and (select public.meow_has_module('virtual_assets')))
  with check (bucket_id = 'meow-cat-model-photos' and (select public.meow_has_module('virtual_assets')));
drop policy if exists "meow: cat model photos delete virtual_assets" on storage.objects;
create policy "meow: cat model photos delete virtual_assets" on storage.objects for delete to authenticated
  using (bucket_id = 'meow-cat-model-photos' and (select public.meow_has_module('virtual_assets')));

-- 公開 bucket：已上架／母體檔任何人可讀；寫入僅 virtual_assets
drop policy if exists "meow: cat models public read" on storage.objects;
create policy "meow: cat models public read" on storage.objects for select
  using (bucket_id = 'meow-cat-models');
drop policy if exists "meow: cat models write virtual_assets" on storage.objects;
create policy "meow: cat models write virtual_assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'meow-cat-models' and (select public.meow_has_module('virtual_assets')));
drop policy if exists "meow: cat models update virtual_assets" on storage.objects;
create policy "meow: cat models update virtual_assets" on storage.objects for update to authenticated
  using (bucket_id = 'meow-cat-models' and (select public.meow_has_module('virtual_assets')))
  with check (bucket_id = 'meow-cat-models' and (select public.meow_has_module('virtual_assets')));
drop policy if exists "meow: cat models delete virtual_assets" on storage.objects;
create policy "meow: cat models delete virtual_assets" on storage.objects for delete to authenticated
  using (bucket_id = 'meow-cat-models' and (select public.meow_has_module('virtual_assets')));

-- =========================================================
-- 5. RLS
-- =========================================================
alter table public.meow_cat_models enable row level security;
alter table public.meow_cat_model_jobs enable row level security;

revoke all on public.meow_cat_models, public.meow_cat_model_jobs from anon, authenticated;
grant select on public.meow_cat_models, public.meow_cat_model_jobs to authenticated;
grant insert, update, delete on public.meow_cat_models, public.meow_cat_model_jobs to authenticated;

drop policy if exists "meow_cat_models: read" on public.meow_cat_models;
create policy "meow_cat_models: read" on public.meow_cat_models for select to authenticated using (
  status = 'published'
  or (select public.meow_has_module('virtual_assets'))
  or (owner_type = 'member' and owner_id = auth.uid())
);

drop policy if exists "meow_cat_models: write virtual_assets" on public.meow_cat_models;
create policy "meow_cat_models: write virtual_assets" on public.meow_cat_models for all to authenticated
  using ((select public.meow_has_module('virtual_assets')))
  with check ((select public.meow_has_module('virtual_assets')));

drop policy if exists "meow_cat_model_jobs: read" on public.meow_cat_model_jobs;
create policy "meow_cat_model_jobs: read" on public.meow_cat_model_jobs for select to authenticated using (
  (select public.meow_has_module('virtual_assets'))
  or exists (
    select 1 from public.meow_cat_models m
     where m.id = model_id and m.owner_type = 'member' and m.owner_id = auth.uid()
  )
);

drop policy if exists "meow_cat_model_jobs: write virtual_assets" on public.meow_cat_model_jobs;
create policy "meow_cat_model_jobs: write virtual_assets" on public.meow_cat_model_jobs for all to authenticated
  using ((select public.meow_has_module('virtual_assets')))
  with check ((select public.meow_has_module('virtual_assets')));

-- =========================================================
-- 6. 上架／下架（原因必填、寫稽核）
-- =========================================================
create or replace function public.meow_publish_cat_model(p_id text, p_action text, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare m public.meow_cat_models; next_status text;
begin
  if not public.meow_has_module('virtual_assets') then
    raise exception 'permission_denied' using hint = '你沒有這個模組的權限';
  end if;
  perform public.meow_hq_require_reason(p_reason);
  if p_action is distinct from 'publish' and p_action is distinct from 'unpublish' then
    raise exception 'invalid_action' using hint = '只接受 publish 或 unpublish';
  end if;
  select * into m from public.meow_cat_models where id = p_id;
  if not found then raise exception 'not_found' using hint = '找不到這隻貓'; end if;
  if p_action = 'publish' then
    if m.status not in ('ready', 'unpublished') then
      raise exception 'invalid_state' using hint = '要先產生貼圖才能上架';
    end if;
    next_status := 'published';
  else
    if m.status is distinct from 'published' then
      raise exception 'invalid_state' using hint = '目前的狀態不能下架';
    end if;
    next_status := 'unpublished';
  end if;
  update public.meow_cat_models set status = next_status, updated_at = now() where id = p_id;
  perform public.meow_hq_log(
    case when p_action = 'publish' then 'publish_model' else 'unpublish_model' end,
    'cat_model', p_id, p_reason, jsonb_build_object('from', m.status, 'to', next_status)
  );
  return next_status;
end $$;

revoke all on function public.meow_publish_cat_model(text, text, text) from public, anon;
grant execute on function public.meow_publish_cat_model(text, text, text) to authenticated;
