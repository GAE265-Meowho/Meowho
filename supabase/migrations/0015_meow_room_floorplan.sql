-- MeowHQ｜平面圖轉 3D 室內空間（Issue #138，規格 docs/hq/05）
-- 共用專案規則（AGENTS.md §7）：只修改 meow_ 開頭的物件；可重複執行。
-- ⚠ 執行前須經 Tina 確認（AGENTS.md §7.4）。
-- 一戶＝meow_room_models 一列（source = 'floorplan'），房間與 AI 讀出的結構放 meta.rooms；原圖在 Azure Blob（決策 006），只存路徑。
-- 影片房間（#93）預設 source = 'video'，不受影響；RLS 沿用 0014 的 virtual_assets policy。

alter table public.meow_room_models
  add column if not exists source text not null default 'video';

alter table public.meow_room_models drop constraint if exists meow_room_models_source_check;
alter table public.meow_room_models
  add constraint meow_room_models_source_check check (source in ('video', 'floorplan'));

-- Q7：第一版只有後台上傳，一律 null；之後開放前台貓戶時才填
alter table public.meow_room_models
  add column if not exists owner_household_id uuid references public.meow_households (id) on delete cascade;

create index if not exists meow_room_models_source_idx on public.meow_room_models (source, updated_at desc);
