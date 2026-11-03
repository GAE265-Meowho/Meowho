-- 0017 領養任務目標流程（規格 docs/spec/09_領養任務目標流程規格.md）
-- 一次補齊：貓「準備中」與「準備出發找新主人」、中途的 3D 貓、領養任務與系統預設任務、任務進度／證明／放棄標籤、
--   前台我的 3D 房間、環境報告與分享、收藏／私訊／領養問卷都要先有喵戶。
-- 可重複執行；只動 meow_ 開頭的物件、meow- 開頭的 bucket、meow: 開頭的 storage policy（AGENTS.md §7）。
-- ⚠ 執行前須經發起人確認（AGENTS.md §7.4）。
-- 上線順序：
--   1. 這個檔不會讓現有畫面壞掉：新增貓仍可直接是待領養（現在 /onboarding 會送 status = 'adoptable'）。
--      等「準備出發找新主人」畫面做好、/onboarding 改送 'preparing' 後，再另開 migration 把新增限制成只能是 'preparing'。
--   2. 收藏、私訊、領養問卷改成要先有喵戶：沒有喵戶的會員會收到 household_required，畫面要接這個錯誤代碼。
-- 錯誤代碼：household_required、cat_not_preparing、cat_model_not_confirmed、cat_tasks_not_ready、cat_not_keeper、
--   task_content_invalid、task_template_missing、run_in_progress、run_not_found、run_not_complete、run_cat_not_ready、
--   run_room_not_ready、abandon_reason_required、abandon_note_required、room_not_found、report_not_ready、report_not_owner、
--   thread_not_member、report_not_shared、advice_too_long。

-- =========================================================
-- 1. 共用小函式
-- =========================================================
-- 有沒有喵戶（收藏、私訊、領養問卷、領養任務都要）
create or replace function public.meow_has_household(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.meow_households where owner_id = p_user)
$$;

-- 這隻貓目前所在喵戶的喵戶長（中途）
create or replace function public.meow_cat_keeper(p_cat_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select h.owner_id from public.meow_cats c join public.meow_households h on h.id = c.household_id where c.id = p_cat_id
$$;

-- 3D 母體只有成貓、幼貓兩種體型（0016）；老貓用成貓體型
create or replace function public.meow_cat_body_type(p_life_stage text)
returns text language sql immutable as $$
  select case when p_life_stage = 'kitten' then 'kitten' else 'adult' end
$$;

-- =========================================================
-- 2. 貓「準備中」：中途按「準備出發找新主人」前，前台完全看不到
-- =========================================================
alter table public.meow_cats drop constraint if exists meow_cats_status_check;
alter table public.meow_cats add constraint meow_cats_status_check
  check (status in ('own', 'adoptable', 'adopted', 'preparing'));

-- 新增貓：只有中途的喵戶能新增；過渡期允許待領養或準備中（見檔頭「上線順序」）
create or replace function public.meow_cat_insert_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.meow_in_cat_flow() or auth.uid() is null then return new; end if;
  if (select caretaker_type from public.meow_households where id = new.household_id) = 'cat_owner' then
    raise exception 'cat_owner_cannot_add_cat' using errcode = 'P0001', hint = '一般飼主的喵戶不能新增貓咪';
  end if;
  if new.status not in ('adoptable', 'preparing') or new.origin_household_id is not null then
    raise exception 'cat_status_flow_only' using errcode = 'P0001', hint = '新增的貓一律是準備中或待領養';
  end if;
  return new;
end $$;

-- 準備中的貓只有自己看得到（喵戶公開也一樣）
drop policy if exists "meow_cats: read visible" on public.meow_cats;
create policy "meow_cats: read visible" on public.meow_cats for select using (
  exists (select 1 from public.meow_households h where h.id = meow_cats.household_id
          and (h.owner_id = auth.uid()
               or meow_cats.status = 'adoptable'
               or (meow_cats.status <> 'preparing' and coalesce(meow_cats.visibility, h.default_visibility) = 'public')))
);

-- 準備中的貓可以先把問卷設好（出發後才有人填得到）
create or replace function public.meow_adoption_form_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_open and (select status from public.meow_cats where id = new.cat_id) not in ('adoptable', 'preparing') then
    raise exception 'form_cat_not_adoptable' using errcode = 'P0001', hint = '只有待領養的貓能開放領養問卷';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- =========================================================
-- 3. 中途的 3D 貓：meow_cat_models 綁定前台的貓（owner_type = 'member'）
-- =========================================================
alter table public.meow_cat_models add column if not exists cat_id uuid references public.meow_cats (id) on delete cascade;
create unique index if not exists meow_cat_models_cat_idx on public.meow_cat_models (cat_id) where cat_id is not null;
alter table public.meow_cat_models drop constraint if exists meow_cat_models_cat_member_check;
alter table public.meow_cat_models add constraint meow_cat_models_cat_member_check
  check (cat_id is null or owner_type = 'member');

-- 待領養貓的 3D 模型：登入的人都讀得到（進行領養任務要用）
drop policy if exists "meow_cat_models: read" on public.meow_cat_models;
create policy "meow_cat_models: read" on public.meow_cat_models for select to authenticated using (
  status = 'published'
  or (select public.meow_has_module('virtual_assets'))
  or (owner_type = 'member' and owner_id = auth.uid())
  or (cat_id is not null and exists (select 1 from public.meow_cats c where c.id = meow_cat_models.cat_id and c.status = 'adoptable'))
);
drop policy if exists "meow_cat_model_variants: read" on public.meow_cat_model_variants;
create policy "meow_cat_model_variants: read" on public.meow_cat_model_variants for select to authenticated using (
  exists (select 1 from public.meow_cat_models m where m.id = model_id and (
    m.status = 'published' or (select public.meow_has_module('virtual_assets'))
    or (m.owner_type = 'member' and m.owner_id = auth.uid())
    or (m.cat_id is not null and exists (select 1 from public.meow_cats c where c.id = m.cat_id and c.status = 'adoptable'))
  ))
);
-- 中途自己的貓照片：放 meow-cat-model-photos 的 member/<自己的 id>/ 底下；產生三視角、貼圖由伺服器（service role）做
drop policy if exists "meow: cat model photos member own" on storage.objects;
create policy "meow: cat model photos member own" on storage.objects for all to authenticated
  using (bucket_id = 'meow-cat-model-photos' and (storage.foldername(name))[1] = 'member'
         and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'meow-cat-model-photos' and (storage.foldername(name))[1] = 'member'
              and (storage.foldername(name))[2] = auth.uid()::text);

-- 3D 貓確認了沒：這隻貓年齡層對應的體型有確認過的紋理貼圖
create or replace function public.meow_cat_model_confirmed(p_cat_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.meow_cats c
      join public.meow_cat_models m on m.cat_id = c.id
      join public.meow_cat_model_variants v on v.model_id = m.id and v.body_type = public.meow_cat_body_type(c.life_stage)
     where c.id = p_cat_id and v.confirmed_albedo is not null
  )
$$;

-- 中途確認 3D 貓：把目前的紋理貼圖設為已確認
create or replace function public.meow_confirm_cat_model(p_cat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.meow_cats; v_model text;
begin
  select * into c from public.meow_cats where id = p_cat_id;
  if c.id is null or public.meow_cat_keeper(p_cat_id) is distinct from auth.uid() then
    raise exception 'cat_not_keeper' using errcode = 'P0001', hint = '只有這隻貓的喵戶長能確認';
  end if;
  select id into v_model from public.meow_cat_models where cat_id = p_cat_id;
  update public.meow_cat_model_variants set confirmed_albedo = albedo_path, updated_at = now()
   where model_id = v_model and body_type = public.meow_cat_body_type(c.life_stage) and albedo_path is not null;
  if not found then
    raise exception 'cat_model_not_confirmed' using errcode = 'P0001', hint = '3D 模型還沒產生好';
  end if;
end $$;

-- =========================================================
-- 4. 領養任務
-- 內容格式（程式用 zod 檢查完整格式，資料庫檢查下面這些最低條件）：
--   {"tasks": [{"id", "day", "title", "story", "action", "needs": [...], "options": [{"text", "good", "feedback"}]}]}
-- =========================================================
-- 系統預設任務：依年齡層各一套，由 MeowHQ 維護
create table if not exists public.meow_task_templates (
  id uuid primary key default gen_random_uuid(),
  life_stage text not null check (life_stage in ('kitten', 'adult', 'senior')),
  title text not null check (char_length(btrim(title)) between 1 and 60),
  content jsonb not null check (pg_column_size(content) <= 200000),
  is_active boolean not null default false,
  updated_by uuid references public.meow_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists meow_task_templates_active_idx on public.meow_task_templates (life_stage) where is_active;

-- 中途正在編輯的任務（草稿，可以隨時存）
create table if not exists public.meow_cat_task_sets (
  cat_id uuid primary key references public.meow_cats (id) on delete cascade,
  source text not null default 'ai' check (source in ('ai', 'manual', 'default')),
  draft jsonb not null default '{"tasks": []}'::jsonb check (pg_column_size(draft) <= 200000),
  difficulty int not null default 2 check (difficulty between 1 and 5),
  current_version_id uuid,
  updated_at timestamptz not null default now()
);

-- 存好的任務版本：存了就不再改。領養人開始任務時記下版本，之後中途改任務也不影響他（規格 §10.1 #9）
create table if not exists public.meow_cat_task_versions (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references public.meow_cats (id) on delete cascade,
  version int not null check (version >= 1),
  source text not null check (source in ('ai', 'manual', 'default')),
  template_id uuid references public.meow_task_templates (id) on delete set null,
  content jsonb not null check (pg_column_size(content) <= 200000),
  difficulty int not null check (difficulty between 1 and 5),
  created_by uuid references public.meow_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (cat_id, version)
);
alter table public.meow_cat_task_sets drop constraint if exists meow_cat_task_sets_current_version_fkey;
alter table public.meow_cat_task_sets add constraint meow_cat_task_sets_current_version_fkey
  foreign key (current_version_id) references public.meow_cat_task_versions (id) on delete set null;

-- 目前版本只能由 meow_save_cat_tasks 設定（草稿可以直接存）
create or replace function public.meow_cat_task_set_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('meow.task_flow', true), '') = 'on' then return new; end if;
  if (tg_op = 'INSERT' and new.current_version_id is not null)
     or (tg_op = 'UPDATE' and (new.current_version_id is distinct from old.current_version_id or new.cat_id is distinct from old.cat_id)) then
    raise exception 'task_content_invalid' using errcode = 'P0001', hint = '請用「儲存任務」';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists meow_cat_task_sets_guard on public.meow_cat_task_sets;
create trigger meow_cat_task_sets_guard before insert or update on public.meow_cat_task_sets
  for each row execute function public.meow_cat_task_set_guard();

-- 每個任務都有 id、劇情、2～6 個選項、每個選項都有回饋、至少一個好的選項；回傳 null＝通過，否則是原因
create or replace function public.meow_task_content_error(p_content jsonb)
returns text language plpgsql immutable as $$
declare t jsonb; o jsonb; ids text[] := '{}'; n int; good int;
begin
  if jsonb_typeof(p_content) <> 'object' or jsonb_typeof(p_content -> 'tasks') <> 'array' then return '格式不正確'; end if;
  n := jsonb_array_length(p_content -> 'tasks');
  if n < 1 or n > 60 then return '任務要有 1～60 個'; end if;
  for t in select * from jsonb_array_elements(p_content -> 'tasks') loop
    if coalesce(btrim(t ->> 'id'), '') = '' or (t ->> 'id') = any (ids) then return '任務 id 重複或空白'; end if;
    ids := ids || (t ->> 'id');
    if coalesce(btrim(t ->> 'story'), '') = '' then return '「' || coalesce(t ->> 'title', t ->> 'id') || '」還沒有劇情'; end if;
    if jsonb_typeof(t -> 'options') <> 'array' or jsonb_array_length(t -> 'options') not between 2 and 6 then
      return '「' || coalesce(t ->> 'title', t ->> 'id') || '」要有 2～6 個選項';
    end if;
    good := 0;
    for o in select * from jsonb_array_elements(t -> 'options') loop
      if coalesce(btrim(o ->> 'text'), '') = '' or coalesce(btrim(o ->> 'feedback'), '') = '' then
        return '「' || coalesce(t ->> 'title', t ->> 'id') || '」有選項沒有文字或回饋';
      end if;
      if (o ->> 'good')::boolean is true then good := good + 1; end if;
    end loop;
    if good = 0 then return '「' || coalesce(t ->> 'title', t ->> 'id') || '」至少要有一個好的選項'; end if;
  end loop;
  return null;
end $$;

-- 中途按「儲存任務」或選「先用系統預設任務」：通過檢查才存成新版本
create or replace function public.meow_save_cat_tasks(p_cat_id uuid, p_use_default boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.meow_cats; s public.meow_cat_task_sets; tpl public.meow_task_templates; err text; vid uuid; nextv int;
begin
  select * into c from public.meow_cats where id = p_cat_id;
  if c.id is null or public.meow_cat_keeper(p_cat_id) is distinct from auth.uid() then
    raise exception 'cat_not_keeper' using errcode = 'P0001', hint = '只有這隻貓的喵戶長能出任務';
  end if;
  perform set_config('meow.task_flow', 'on', true);
  insert into public.meow_cat_task_sets (cat_id) values (p_cat_id) on conflict (cat_id) do nothing;
  select * into s from public.meow_cat_task_sets where cat_id = p_cat_id for update;
  select coalesce(max(version), 0) + 1 into nextv from public.meow_cat_task_versions where cat_id = p_cat_id;
  if p_use_default then
    select * into tpl from public.meow_task_templates where life_stage = coalesce(c.life_stage, 'adult') and is_active;
    if tpl.id is null then
      raise exception 'task_template_missing' using errcode = 'P0001', hint = '這個年齡層還沒有系統預設任務';
    end if;
    insert into public.meow_cat_task_versions (cat_id, version, source, template_id, content, difficulty, created_by)
    values (p_cat_id, nextv, 'default', tpl.id, tpl.content, s.difficulty, auth.uid()) returning id into vid;
    update public.meow_cat_task_sets set source = 'default', current_version_id = vid, updated_at = now() where cat_id = p_cat_id;
  else
    err := public.meow_task_content_error(s.draft);
    if err is not null then
      raise exception 'task_content_invalid' using errcode = 'P0001', hint = err;
    end if;
    insert into public.meow_cat_task_versions (cat_id, version, source, content, difficulty, created_by)
    values (p_cat_id, nextv, s.source, s.draft, s.difficulty, auth.uid()) returning id into vid;
    update public.meow_cat_task_sets set current_version_id = vid, updated_at = now() where cat_id = p_cat_id;
  end if;
  perform set_config('meow.task_flow', '', true);
  return vid;
end $$;

-- =========================================================
-- 5. 準備出發找新主人：3D 貓已確認＋任務已存（自訂或預設）→ 貓變待領養，前台開始顯示
-- =========================================================
create or replace function public.meow_publish_cat(p_cat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.meow_cats;
begin
  select * into c from public.meow_cats where id = p_cat_id for update;
  if c.id is null or public.meow_cat_keeper(p_cat_id) is distinct from auth.uid() then
    raise exception 'cat_not_keeper' using errcode = 'P0001', hint = '只有這隻貓的喵戶長能讓牠出發';
  end if;
  if c.status <> 'preparing' then
    raise exception 'cat_not_preparing' using errcode = 'P0001', hint = '這隻貓已經出發了';
  end if;
  if not public.meow_cat_model_confirmed(p_cat_id) then
    raise exception 'cat_model_not_confirmed' using errcode = 'P0001', hint = '3D 模型還沒確認';
  end if;
  if not exists (select 1 from public.meow_cat_task_sets where cat_id = p_cat_id and current_version_id is not null) then
    raise exception 'cat_tasks_not_ready' using errcode = 'P0001', hint = '任務還沒完成';
  end if;
  perform set_config('meow.cat_flow', 'on', true);
  update public.meow_cats set status = 'adoptable', updated_at = now() where id = p_cat_id;
  perform set_config('meow.cat_flow', '', true);
end $$;

-- 「準備出發找新主人」畫面用：兩項檢查的結果
create or replace function public.meow_cat_publish_check(p_cat_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.meow_cat_keeper(p_cat_id) = auth.uid() then jsonb_build_object(
    'model_confirmed', public.meow_cat_model_confirmed(p_cat_id),
    'tasks_ready', exists (select 1 from public.meow_cat_task_sets where cat_id = p_cat_id and current_version_id is not null),
    'tasks_source', (select source from public.meow_cat_task_sets where cat_id = p_cat_id and current_version_id is not null)
  ) end
$$;

-- =========================================================
-- 6. 前台我的 3D 房間（決策 007：只有自己看得到；決策 008 的公開 bucket 不用在這裡）
-- =========================================================
alter table public.meow_room_models add column if not exists env_check text;
alter table public.meow_room_models drop constraint if exists meow_room_models_env_check_check;
alter table public.meow_room_models add constraint meow_room_models_env_check_check
  check (env_check is null or env_check in ('wanted', 'declined', 'declined_again'));
alter table public.meow_room_models add column if not exists completed_at timestamptz;     -- 飼主按「完成」
alter table public.meow_room_models add column if not exists raw_deleted_at timestamptz;   -- 居家原始影片、照片刪除時間
create index if not exists meow_room_models_household_idx on public.meow_room_models (owner_household_id) where owner_household_id is not null;

-- 後台只管示範房間；會員自己家的房間後台也看不到（決策 007）
drop policy if exists "meow_room_models: virtual_assets" on public.meow_room_models;
create policy "meow_room_models: virtual_assets" on public.meow_room_models for all to authenticated
  using (owner_household_id is null and (select public.meow_has_module('virtual_assets')))
  with check (owner_household_id is null and (select public.meow_has_module('virtual_assets')));
-- 喵戶長：讀、刪自己家的房間；建立與處理由伺服器（service role）做
drop policy if exists "meow_room_models: household read own" on public.meow_room_models;
create policy "meow_room_models: household read own" on public.meow_room_models for select to authenticated using (
  exists (select 1 from public.meow_households h where h.id = meow_room_models.owner_household_id and h.owner_id = auth.uid())
);
drop policy if exists "meow_room_models: household delete own" on public.meow_room_models;
create policy "meow_room_models: household delete own" on public.meow_room_models for delete to authenticated using (
  exists (select 1 from public.meow_households h where h.id = meow_room_models.owner_household_id and h.owner_id = auth.uid())
);
drop policy if exists "meow_room_jobs: virtual_assets" on public.meow_room_jobs;
create policy "meow_room_jobs: virtual_assets" on public.meow_room_jobs for all to authenticated
  using ((select public.meow_has_module('virtual_assets'))
         and exists (select 1 from public.meow_room_models r where r.id = room_id and r.owner_household_id is null))
  with check ((select public.meow_has_module('virtual_assets'))
              and exists (select 1 from public.meow_room_models r where r.id = room_id and r.owner_household_id is null));
drop policy if exists "meow_room_jobs: household read own" on public.meow_room_jobs;
create policy "meow_room_jobs: household read own" on public.meow_room_jobs for select to authenticated using (
  exists (select 1 from public.meow_room_models r join public.meow_households h on h.id = r.owner_household_id
          where r.id = room_id and h.owner_id = auth.uid())
);

-- 飼主按「完成」：記下環境檢查的選擇；刪原始檔由伺服器做完後寫 raw_deleted_at
create or replace function public.meow_finish_home_room(p_room_id text, p_env_check text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_env_check is not null and p_env_check not in ('wanted', 'declined', 'declined_again') then
    raise exception 'room_not_found' using errcode = 'P0001', hint = '環境檢查選項不正確';
  end if;
  update public.meow_room_models r set completed_at = coalesce(r.completed_at, now()), env_check = coalesce(p_env_check, r.env_check), updated_at = now()
   where r.id = p_room_id and r.status = 'ready'
     and exists (select 1 from public.meow_households h where h.id = r.owner_household_id and h.owner_id = auth.uid());
  if not found then
    raise exception 'room_not_found' using errcode = 'P0001', hint = '找不到這間房間，或還沒建好';
  end if;
end $$;

-- 私有 bucket：居家原始影片（轉完、按完成後刪）、3D 房間成果；路徑第一層是喵戶 id
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meow-home-videos', 'meow-home-videos', false, 52428800, array['video/mp4', 'video/quicktime'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meow-home-scenes', 'meow-home-scenes', false, 52428800, null)
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "meow: home videos own" on storage.objects;
create policy "meow: home videos own" on storage.objects for all to authenticated
  using (bucket_id = 'meow-home-videos' and exists (
    select 1 from public.meow_households h where h.id::text = (storage.foldername(name))[1] and h.owner_id = auth.uid()))
  with check (bucket_id = 'meow-home-videos' and exists (
    select 1 from public.meow_households h where h.id::text = (storage.foldername(name))[1] and h.owner_id = auth.uid()));
drop policy if exists "meow: home scenes read own" on storage.objects;
create policy "meow: home scenes read own" on storage.objects for select to authenticated
  using (bucket_id = 'meow-home-scenes' and exists (
    select 1 from public.meow_households h where h.id::text = (storage.foldername(name))[1] and h.owner_id = auth.uid()));

-- =========================================================
-- 7. 環境報告（決策 007：預設只有自己看得到；在對話串分享後該位中途才看得到，中途可以寫建議）
-- =========================================================
create table if not exists public.meow_env_reports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.meow_households (id) on delete cascade,
  room_model_id text references public.meow_room_models (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'ready', 'failed')),
  summary text check (summary is null or char_length(summary) <= 2000),
  -- 風險項目 [{key, label, level, note, crop_path}]；crop_path 在 meow-home-risk-crops/<報告 id>/
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and pg_column_size(items) <= 100000),
  error text,
  created_at timestamptz not null default now(),
  ready_at timestamptz
);
create index if not exists meow_env_reports_household_idx on public.meow_env_reports (household_id, created_at desc);

create table if not exists public.meow_env_report_shares (
  report_id uuid not null references public.meow_env_reports (id) on delete cascade,
  thread_id uuid not null references public.meow_threads (id) on delete cascade,
  shared_at timestamptz not null default now(),
  primary key (report_id, thread_id)
);

create table if not exists public.meow_env_report_advice (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.meow_env_reports (id) on delete cascade,
  thread_id uuid not null references public.meow_threads (id) on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 60),
  author_id uuid not null references public.meow_profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists meow_env_report_advice_report_idx on public.meow_env_report_advice (report_id, created_at);

-- 我是不是某份報告被分享到的對話串的中途
create or replace function public.meow_env_report_keeper(p_report_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.meow_env_report_shares s join public.meow_threads t on t.id = s.thread_id
                   join public.meow_households h on h.id = t.household_id
                  where s.report_id = p_report_id and h.owner_id = p_user)
$$;
create or replace function public.meow_env_report_owner(p_report_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.meow_env_reports r join public.meow_households h on h.id = r.household_id
                  where r.id = p_report_id and h.owner_id = p_user)
$$;

alter table public.meow_env_reports enable row level security;
alter table public.meow_env_report_shares enable row level security;
alter table public.meow_env_report_advice enable row level security;

drop policy if exists "meow_env_reports: read" on public.meow_env_reports;
create policy "meow_env_reports: read" on public.meow_env_reports for select to authenticated using (
  public.meow_env_report_owner(id, auth.uid()) or public.meow_env_report_keeper(id, auth.uid())
);
drop policy if exists "meow_env_reports: delete own" on public.meow_env_reports;
create policy "meow_env_reports: delete own" on public.meow_env_reports for delete to authenticated using (
  public.meow_env_report_owner(id, auth.uid())
);
drop policy if exists "meow_env_report_shares: read" on public.meow_env_report_shares;
create policy "meow_env_report_shares: read" on public.meow_env_report_shares for select to authenticated using (
  public.meow_env_report_owner(report_id, auth.uid()) or public.meow_thread_keeper(thread_id) = auth.uid()
);
drop policy if exists "meow_env_report_advice: read" on public.meow_env_report_advice;
create policy "meow_env_report_advice: read" on public.meow_env_report_advice for select to authenticated using (
  public.meow_env_report_owner(report_id, auth.uid()) or author_id = auth.uid()
);
drop policy if exists "meow_env_report_advice: insert keeper" on public.meow_env_report_advice;
create policy "meow_env_report_advice: insert keeper" on public.meow_env_report_advice for insert to authenticated with check (
  author_id = auth.uid() and public.meow_thread_keeper(thread_id) = auth.uid()
  and exists (select 1 from public.meow_env_report_shares s where s.report_id = meow_env_report_advice.report_id and s.thread_id = meow_env_report_advice.thread_id)
);
drop policy if exists "meow_env_report_advice: delete own" on public.meow_env_report_advice;
create policy "meow_env_report_advice: delete own" on public.meow_env_report_advice for delete to authenticated using (author_id = auth.uid());

-- 領養人在對話串按「分享環境報告」
create or replace function public.meow_share_env_report(p_report_id uuid, p_thread_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.meow_env_report_owner(p_report_id, auth.uid()) then
    raise exception 'report_not_owner' using errcode = 'P0001', hint = '只能分享自己的環境報告';
  end if;
  if not exists (select 1 from public.meow_env_reports where id = p_report_id and status = 'ready') then
    raise exception 'report_not_ready' using errcode = 'P0001', hint = '環境報告還沒產生好';
  end if;
  if not exists (select 1 from public.meow_threads where id = p_thread_id and member_id = auth.uid()) then
    raise exception 'thread_not_member' using errcode = 'P0001', hint = '找不到這個對話';
  end if;
  insert into public.meow_env_report_shares (report_id, thread_id) values (p_report_id, p_thread_id) on conflict do nothing;
  if found then perform public.meow_thread_event(p_thread_id, '分享了居家環境報告。'); end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meow-home-risk-crops', 'meow-home-risk-crops', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "meow: home risk crops read" on storage.objects;
create policy "meow: home risk crops read" on storage.objects for select to authenticated
  using (bucket_id = 'meow-home-risk-crops' and exists (
    select 1 from public.meow_env_reports r where r.id::text = (storage.foldername(name))[1]
       and (public.meow_env_report_owner(r.id, auth.uid()) or public.meow_env_report_keeper(r.id, auth.uid()))));

-- =========================================================
-- 8. 領養人進行任務：進度、任務證明、放棄任務標籤
-- =========================================================
create table if not exists public.meow_task_runs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.meow_profiles (id) on delete cascade,
  cat_id uuid not null references public.meow_cats (id) on delete cascade,
  version_id uuid not null references public.meow_cat_task_versions (id) on delete restrict,
  room_model_id text references public.meow_room_models (id) on delete set null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  -- {"done": [任務 id], "choices": {任務 id: [選過的選項序號]}, "day": 目前第幾天}
  progress jsonb not null default '{"done": [], "choices": {}}'::jsonb check (jsonb_typeof(progress) = 'object' and pg_column_size(progress) <= 50000),
  summary text check (summary is null or char_length(summary) <= 2000),   -- AI 摘要，由伺服器寫入
  proof_shared_at timestamptz,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
-- 同時只能進行一隻貓的任務
create unique index if not exists meow_task_runs_one_active on public.meow_task_runs (member_id) where status = 'in_progress';
create index if not exists meow_task_runs_cat_idx on public.meow_task_runs (cat_id, member_id, started_at desc);

-- 放棄任務標籤：領養人自己讀不到（沒有給本人的 policy），只有這隻貓的中途讀得到
create table if not exists public.meow_task_abandons (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.meow_task_runs (id) on delete cascade,
  member_id uuid not null references public.meow_profiles (id) on delete cascade,
  cat_id uuid not null references public.meow_cats (id) on delete cascade,
  reasons text[] not null check (cardinality(reasons) between 1 and 6
    and reasons <@ array['no_time', 'not_ready', 'not_a_fit', 'try_other_cat', 'too_hard', 'other']),
  note text check (note is null or char_length(note) <= 500),
  day int,
  created_at timestamptz not null default now()
);
create index if not exists meow_task_abandons_cat_idx on public.meow_task_abandons (cat_id, member_id);

-- 領養人只能改自己進行中的進度
create or replace function public.meow_task_run_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('meow.task_flow', true), '') = 'on' then return new; end if;
  if old.status <> 'in_progress' or new.status is distinct from old.status or new.member_id is distinct from old.member_id
     or new.cat_id is distinct from old.cat_id or new.version_id is distinct from old.version_id
     or new.summary is distinct from old.summary or new.proof_shared_at is distinct from old.proof_shared_at
     or new.finished_at is distinct from old.finished_at or new.started_at is distinct from old.started_at then
    raise exception 'run_not_found' using errcode = 'P0001', hint = '只能更新進行中任務的進度';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists meow_task_runs_guard on public.meow_task_runs;
create trigger meow_task_runs_guard before update on public.meow_task_runs
  for each row execute function public.meow_task_run_guard();

-- 開始任務：要有喵戶、自己建好的房間；這隻貓要待領養、有任務。已在做這隻就回傳原本那筆
create or replace function public.meow_start_task_run(p_cat_id uuid, p_room_id text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.meow_cats; vid uuid; rid uuid; other uuid;
begin
  if auth.uid() is null or public.meow_is_suspended(auth.uid()) then
    raise exception 'message_suspended' using errcode = 'P0001', hint = '目前無法進行任務';
  end if;
  if not public.meow_has_household(auth.uid()) then
    raise exception 'household_required' using errcode = 'P0001', hint = '請先建立喵戶';
  end if;
  select * into c from public.meow_cats where id = p_cat_id;
  select current_version_id into vid from public.meow_cat_task_sets where cat_id = p_cat_id;
  if c.id is null or c.status <> 'adoptable' or vid is null or public.meow_cat_keeper(p_cat_id) = auth.uid() then
    raise exception 'run_cat_not_ready' using errcode = 'P0001', hint = '這隻貓目前不能進行領養任務';
  end if;
  if not exists (select 1 from public.meow_room_models r join public.meow_households h on h.id = r.owner_household_id
                  where r.id = p_room_id and r.status = 'ready' and r.completed_at is not null and h.owner_id = auth.uid()) then
    raise exception 'run_room_not_ready' using errcode = 'P0001', hint = '請先建立你家的 3D 房間';
  end if;
  select id, cat_id into rid, other from public.meow_task_runs where member_id = auth.uid() and status = 'in_progress';
  if rid is not null then
    if other = p_cat_id then return rid; end if;
    raise exception 'run_in_progress' using errcode = 'P0001', hint = '你正在進行另一隻貓的領養任務，要先完成或放棄';
  end if;
  insert into public.meow_task_runs (member_id, cat_id, version_id, room_model_id)
  values (auth.uid(), p_cat_id, vid, p_room_id) returning id into rid;
  return rid;
end $$;

-- 放棄任務：理由必選（「其他」要填說明），加上放棄任務標籤
create or replace function public.meow_abandon_task_run(p_run_id uuid, p_reasons text[], p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.meow_task_runs; txt text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into r from public.meow_task_runs where id = p_run_id and member_id = auth.uid() and status = 'in_progress' for update;
  if r.id is null then raise exception 'run_not_found' using errcode = 'P0001', hint = '找不到進行中的任務'; end if;
  if coalesce(cardinality(p_reasons), 0) = 0 then
    raise exception 'abandon_reason_required' using errcode = 'P0001', hint = '請選擇放棄的原因';
  end if;
  if 'other' = any (p_reasons) and txt is null then
    raise exception 'abandon_note_required' using errcode = 'P0001', hint = '選「其他」時請寫下原因';
  end if;
  perform set_config('meow.task_flow', 'on', true);
  update public.meow_task_runs set status = 'abandoned', finished_at = now(), updated_at = now() where id = r.id;
  perform set_config('meow.task_flow', '', true);
  insert into public.meow_task_abandons (run_id, member_id, cat_id, reasons, note, day)
  values (r.id, r.member_id, r.cat_id, p_reasons, txt, nullif(r.progress ->> 'day', '')::int);
end $$;

-- 完成任務：版本裡每個任務都在 done 裡才算完成；AI 摘要之後由伺服器補上
create or replace function public.meow_complete_task_run(p_run_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.meow_task_runs; missing int;
begin
  select * into r from public.meow_task_runs where id = p_run_id and member_id = auth.uid() and status = 'in_progress' for update;
  if r.id is null then raise exception 'run_not_found' using errcode = 'P0001', hint = '找不到進行中的任務'; end if;
  select count(*) into missing
    from public.meow_cat_task_versions v, jsonb_array_elements(v.content -> 'tasks') t
   where v.id = r.version_id
     and not (coalesce(r.progress -> 'done', '[]'::jsonb) ? (t ->> 'id'));
  if missing > 0 then
    raise exception 'run_not_complete' using errcode = 'P0001', hint = '還有任務沒完成';
  end if;
  perform set_config('meow.task_flow', 'on', true);
  update public.meow_task_runs set status = 'completed', finished_at = now(), updated_at = now() where id = r.id;
  perform set_config('meow.task_flow', '', true);
end $$;

-- 附上任務證明：開（或沿用）這隻貓的對話串，留一則系統訊息
create or replace function public.meow_share_task_proof(p_run_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.meow_task_runs; tid uuid;
begin
  select * into r from public.meow_task_runs where id = p_run_id and member_id = auth.uid() and status = 'completed';
  if r.id is null then raise exception 'run_not_found' using errcode = 'P0001', hint = '找不到完成的任務'; end if;
  tid := public.meow_open_thread(r.cat_id);
  if r.proof_shared_at is null then
    perform set_config('meow.task_flow', 'on', true);
    update public.meow_task_runs set proof_shared_at = now() where id = r.id;
    perform set_config('meow.task_flow', '', true);
    perform public.meow_thread_event(tid, '附上了領養任務證明。');
  end if;
  return tid;
end $$;

-- 對話串顯示用：系統認證（完成過）、附上的任務證明、放棄任務標籤（只有中途拿得到）
create or replace function public.meow_thread_task_status(p_thread_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.meow_threads; is_keeper boolean; done public.meow_task_runs;
begin
  select * into t from public.meow_threads where id = p_thread_id;
  if t.id is null then return null; end if;
  is_keeper := public.meow_thread_keeper(p_thread_id) = auth.uid();
  if not is_keeper and t.member_id is distinct from auth.uid() then return null; end if;
  select * into done from public.meow_task_runs
   where cat_id = t.cat_id and member_id = t.member_id and status = 'completed' order by finished_at desc limit 1;
  return jsonb_build_object(
    'completed', done.id is not null,
    'completed_at', done.finished_at,
    'proof', case when done.id is not null and (done.proof_shared_at is not null or not is_keeper) then jsonb_build_object(
      'run_id', done.id, 'summary', done.summary, 'progress', done.progress, 'shared_at', done.proof_shared_at,
      'tasks', (select content -> 'tasks' from public.meow_cat_task_versions where id = done.version_id)) end,
    'abandons', case when is_keeper then coalesce((
      select jsonb_agg(jsonb_build_object('reasons', a.reasons, 'note', a.note, 'day', a.day, 'at', a.created_at) order by a.created_at)
        from public.meow_task_abandons a where a.cat_id = t.cat_id and a.member_id = t.member_id), '[]'::jsonb) end
  );
end $$;

alter table public.meow_task_templates enable row level security;
alter table public.meow_cat_task_sets enable row level security;
alter table public.meow_cat_task_versions enable row level security;
alter table public.meow_task_runs enable row level security;
alter table public.meow_task_abandons enable row level security;

drop policy if exists "meow_task_templates: read" on public.meow_task_templates;
create policy "meow_task_templates: read" on public.meow_task_templates for select to authenticated using (
  is_active or (select public.meow_has_module('virtual_assets'))
);
drop policy if exists "meow_task_templates: write virtual_assets" on public.meow_task_templates;
create policy "meow_task_templates: write virtual_assets" on public.meow_task_templates for all to authenticated
  using ((select public.meow_has_module('virtual_assets')))
  with check ((select public.meow_has_module('virtual_assets')));

drop policy if exists "meow_cat_task_sets: keeper" on public.meow_cat_task_sets;
create policy "meow_cat_task_sets: keeper" on public.meow_cat_task_sets for all to authenticated
  using (public.meow_cat_keeper(cat_id) = auth.uid())
  with check (public.meow_cat_keeper(cat_id) = auth.uid());

drop policy if exists "meow_cat_task_versions: read" on public.meow_cat_task_versions;
create policy "meow_cat_task_versions: read" on public.meow_cat_task_versions for select to authenticated using (
  public.meow_cat_keeper(cat_id) = auth.uid()
  or exists (select 1 from public.meow_cats c where c.id = meow_cat_task_versions.cat_id and c.status = 'adoptable')
  or exists (select 1 from public.meow_task_runs r where r.version_id = meow_cat_task_versions.id and r.member_id = auth.uid())
);

drop policy if exists "meow_task_runs: read own" on public.meow_task_runs;
create policy "meow_task_runs: read own" on public.meow_task_runs for select to authenticated using (member_id = auth.uid());
drop policy if exists "meow_task_runs: update own progress" on public.meow_task_runs;
create policy "meow_task_runs: update own progress" on public.meow_task_runs for update to authenticated
  using (member_id = auth.uid() and status = 'in_progress') with check (member_id = auth.uid());

drop policy if exists "meow_task_abandons: read keeper" on public.meow_task_abandons;
create policy "meow_task_abandons: read keeper" on public.meow_task_abandons for select to authenticated using (
  public.meow_cat_keeper(cat_id) = auth.uid()
);

-- =========================================================
-- 9. 收藏、私訊、領養問卷都要先有喵戶
-- =========================================================
drop policy if exists "meow_cat_favorites: insert own" on public.meow_cat_favorites;
create policy "meow_cat_favorites: insert own" on public.meow_cat_favorites for insert with check (
  user_id = auth.uid() and public.meow_has_household(auth.uid())
  and exists (select 1 from public.meow_cats c where c.id = meow_cat_favorites.cat_id)
);

drop policy if exists "meow_adoption_responses: insert own" on public.meow_adoption_responses;
create policy "meow_adoption_responses: insert own" on public.meow_adoption_responses for insert with check (
  respondent_id = auth.uid() and public.meow_has_household(auth.uid())
  and exists (select 1 from public.meow_adoption_forms f join public.meow_cats c on c.id = f.cat_id
              where f.id = meow_adoption_responses.form_id and f.is_open and c.status = 'adoptable')
);

-- 私訊：沿用 0012 的版本，加上喵戶檢查（已經有的對話串不受影響）
create or replace function public.meow_open_thread(p_cat_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid; c public.meow_cats; h public.meow_households;
begin
  select * into c from public.meow_cats where id = p_cat_id;
  select id into tid from public.meow_threads where cat_id = p_cat_id and member_id = auth.uid();
  if tid is not null then
    update public.meow_threads set homed_at = null, is_adopter = false
     where id = tid and homed_at is not null and household_id = c.household_id and c.status = 'adoptable';
    return tid;
  end if;
  if auth.uid() is null or public.meow_is_suspended(auth.uid()) then
    raise exception 'message_suspended' using errcode = 'P0001', hint = '目前無法傳送訊息';
  end if;
  if not public.meow_has_household(auth.uid()) then
    raise exception 'household_required' using errcode = 'P0001', hint = '請先建立喵戶';
  end if;
  if c.id is null or c.status <> 'adoptable' then
    raise exception 'thread_not_adoptable' using errcode = 'P0001', hint = '只能私訊待領養貓的喵戶長';
  end if;
  select * into h from public.meow_households where id = c.household_id;
  if h.owner_id = auth.uid() then
    raise exception 'thread_own_cat' using errcode = 'P0001', hint = '這是你自己的貓';
  end if;
  if not h.allow_stranger_messages then
    raise exception 'thread_closed' using errcode = 'P0001', hint = '這個喵戶目前不接受私訊';
  end if;
  if public.meow_is_blocked(auth.uid(), h.owner_id) then
    raise exception 'thread_blocked' using errcode = 'P0001', hint = '你們之間有封鎖設定';
  end if;
  return public.meow_ensure_thread(c.id, auth.uid(), null);
end $$;

-- =========================================================
-- 10. 權限
-- =========================================================
revoke all on public.meow_task_templates, public.meow_cat_task_sets, public.meow_cat_task_versions,
  public.meow_task_runs, public.meow_task_abandons, public.meow_env_reports, public.meow_env_report_shares,
  public.meow_env_report_advice from anon;
grant select, insert, update, delete on public.meow_task_templates, public.meow_cat_task_sets to authenticated;
grant select on public.meow_cat_task_versions, public.meow_task_abandons, public.meow_env_report_shares to authenticated;
grant select, update on public.meow_task_runs to authenticated;
grant select, delete on public.meow_env_reports to authenticated;
grant select, insert, delete on public.meow_env_report_advice to authenticated;

revoke all on function public.meow_has_household(uuid) from public, anon;
revoke all on function public.meow_cat_keeper(uuid) from public, anon;
revoke all on function public.meow_cat_model_confirmed(uuid) from public, anon;
revoke all on function public.meow_env_report_keeper(uuid, uuid) from public, anon;
revoke all on function public.meow_env_report_owner(uuid, uuid) from public, anon;
revoke all on function public.meow_confirm_cat_model(uuid) from public, anon;
revoke all on function public.meow_save_cat_tasks(uuid, boolean) from public, anon;
revoke all on function public.meow_publish_cat(uuid) from public, anon;
revoke all on function public.meow_cat_publish_check(uuid) from public, anon;
revoke all on function public.meow_finish_home_room(text, text) from public, anon;
revoke all on function public.meow_share_env_report(uuid, uuid) from public, anon;
revoke all on function public.meow_start_task_run(uuid, text) from public, anon;
revoke all on function public.meow_abandon_task_run(uuid, text[], text) from public, anon;
revoke all on function public.meow_complete_task_run(uuid) from public, anon;
revoke all on function public.meow_share_task_proof(uuid) from public, anon;
revoke all on function public.meow_thread_task_status(uuid) from public, anon;
grant execute on function public.meow_has_household(uuid), public.meow_cat_keeper(uuid), public.meow_cat_model_confirmed(uuid),
  public.meow_env_report_keeper(uuid, uuid), public.meow_env_report_owner(uuid, uuid),
  public.meow_confirm_cat_model(uuid), public.meow_save_cat_tasks(uuid, boolean), public.meow_publish_cat(uuid),
  public.meow_cat_publish_check(uuid), public.meow_finish_home_room(text, text), public.meow_share_env_report(uuid, uuid),
  public.meow_start_task_run(uuid, text), public.meow_abandon_task_run(uuid, text[], text), public.meow_complete_task_run(uuid),
  public.meow_share_task_proof(uuid), public.meow_thread_task_status(uuid) to authenticated;
