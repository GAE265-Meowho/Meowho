-- 0019 喵戶頭像（我的喵戶改版）：喵戶長可以上傳喵戶的頭像，沒上傳就顯示自己的 Google 頭像。
-- 檔案放公開 bucket meow-cat-photos 自己的資料夾（<喵戶長 id>/households/…，沿用 0001 的 policy），這裡只存路徑。
-- 可重複執行；只動 meow_ 開頭的物件（AGENTS.md §7）。⚠ 執行前須經發起人確認（AGENTS.md §7.4）。
alter table public.meow_households add column if not exists avatar_path text;
alter table public.meow_households drop constraint if exists meow_households_avatar_path_check;
alter table public.meow_households add constraint meow_households_avatar_path_check
  check (avatar_path is null or (char_length(avatar_path) between 1 and 300 and avatar_path !~ '^https?:'));
