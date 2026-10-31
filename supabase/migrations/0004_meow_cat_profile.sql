-- 0004 貓咪 profile（#57、規格 #72）：年齡層、個性／健康標籤、原文描述、多張照片、貓影片
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。
-- ⚠ 執行時機：新建的貓必須有年齡層，舊的 /onboarding 一問一答流程沒有送年齡層會建貓失敗。
--   請等新版 /onboarding（同一 Issue）一起上線後再到 Supabase 執行。
-- 影片檔案放 Azure Blob，這裡只存儲存路徑（決策 006）；刪除紀錄不會刪檔，檔案由程式透過儲存介面刪除。

-- =========================================================
-- 貓咪新欄位
-- =========================================================
alter table public.meow_cats add column if not exists life_stage text;
alter table public.meow_cats add column if not exists personality_tags text[] not null default '{}';
alter table public.meow_cats add column if not exists health_tags text[] not null default '{}';
alter table public.meow_cats add column if not exists description text;
alter table public.meow_cats add column if not exists photo_paths text[] not null default '{}';

-- 年齡層：AAFP／AAHA 四級（GLOSSARY「年齡層」）；3D 體型由程式推出，不存
alter table public.meow_cats drop constraint if exists meow_cats_life_stage_check;
alter table public.meow_cats add constraint meow_cats_life_stage_check
  check (life_stage is null or life_stage in ('kitten', 'young_adult', 'mature_adult', 'senior'));
-- 標籤清單會隨 #58 調整，資料庫不限制內容，由程式過濾
alter table public.meow_cats drop constraint if exists meow_cats_description_check;
alter table public.meow_cats add constraint meow_cats_description_check
  check (description is null or char_length(description) <= 2000);
-- 照片存 Supabase Storage 路徑，第 1 張為封面，最多 5 張
alter table public.meow_cats drop constraint if exists meow_cats_photo_paths_check;
alter table public.meow_cats add constraint meow_cats_photo_paths_check
  check (cardinality(photo_paths) <= 5);

-- 這一版建立的貓一律是待領養貓（主線只有送養）
alter table public.meow_cats alter column status set default 'adoptable';

-- 新建的貓必須有年齡層（3D 體型靠它決定）；只檢查新增，舊的測試資料不受影響
create or replace function public.meow_require_life_stage()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.life_stage is null then
    raise exception 'life_stage_required' using errcode = 'P0001', hint = '請選擇年齡層';
  end if;
  return new;
end $$;
drop trigger if exists meow_cats_require_life_stage on public.meow_cats;
create trigger meow_cats_require_life_stage before insert on public.meow_cats
  for each row execute function public.meow_require_life_stage();

-- =========================================================
-- 貓影片（每隻最多 3 支、每支 60 秒內）
-- =========================================================
create table if not exists public.meow_cat_videos (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references public.meow_cats (id) on delete cascade,
  storage_path text not null unique,
  duration_sec numeric not null check (duration_sec > 0 and duration_sec <= 60),
  ai_personality_tags text[] not null default '{}',  -- AI 建議，喵戶長確認後才寫進 meow_cats.personality_tags
  ai_reason text,
  created_at timestamptz not null default now()
);
create index if not exists meow_cat_videos_cat_idx on public.meow_cat_videos (cat_id);

create or replace function public.meow_enforce_cat_video_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.meow_cat_videos where cat_id = new.cat_id) >= 3 then
    raise exception 'video_limit' using errcode = 'P0001', hint = '每隻貓最多 3 支影片';
  end if;
  return new;
end $$;
drop trigger if exists meow_cat_videos_limit on public.meow_cat_videos;
create trigger meow_cat_videos_limit before insert on public.meow_cat_videos
  for each row execute function public.meow_enforce_cat_video_limit();

alter table public.meow_cat_videos enable row level security;

-- 看得到這隻貓就看得到牠的影片（子查詢套用 meow_cats 的 RLS）
drop policy if exists "meow_cat_videos: read visible" on public.meow_cat_videos;
create policy "meow_cat_videos: read visible" on public.meow_cat_videos for select using (
  exists (select 1 from public.meow_cats c where c.id = meow_cat_videos.cat_id)
);
-- 只有貓所在喵戶的擁有者能新增、修改、刪除
drop policy if exists "meow_cat_videos: write own" on public.meow_cat_videos;
create policy "meow_cat_videos: write own" on public.meow_cat_videos for all
  using (exists (select 1 from public.meow_cats c join public.meow_households h on h.id = c.household_id
                 where c.id = meow_cat_videos.cat_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from public.meow_cats c join public.meow_households h on h.id = c.household_id
                      where c.id = meow_cat_videos.cat_id and h.owner_id = auth.uid()));
