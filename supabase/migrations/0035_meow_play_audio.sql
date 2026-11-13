-- 虛擬飼養的背景音樂與音效（第 6 份，#393）：公開 bucket，任何人都能讀（遊戲直接用網址播放）。
-- 路徑：bgm/<ID>.mp3、sfx/<ID>.mp3，旁邊放同名的 <ID>.license.txt。ID 照 src/lib/play/audio.ts 的 SOUNDS。
-- 只開公開讀取；上傳由後台用 service role 跑 `npm run audio:upload`（前台沒有寫入權限）。
-- 2026-11-13 子哲已用 service role 建好 bucket（scripts/upload-play-audio.mjs 會自動建），這支 SQL 留作紀錄，重跑不會有影響。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meow-play-audio', 'meow-play-audio', true, 5242880,
  array['audio/mpeg', 'audio/ogg', 'text/plain']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "meow: play audio public read" on storage.objects;
create policy "meow: play audio public read" on storage.objects for select
  using (bucket_id = 'meow-play-audio');
