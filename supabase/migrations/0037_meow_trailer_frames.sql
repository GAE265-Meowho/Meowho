-- 0037（#489）：MeowHQ「影片 › 前導影片」分鏡圖開放給所有管理員上傳與查看。
-- 0003 的 meow-site-assets policy 只讓系統管理員上傳與列出；這裡另外加兩條只限 videos/trailer/ 資料夾的 policy，
-- 讓管理員（meow_is_admin：系統管理員＋未停權的管理員）也能列出與新增。不開放更新、刪除（重傳是新增一版，舊版保留）。
-- 只動 meow: 開頭的 policy；可重複執行。

drop policy if exists "meow: trailer frames read by admin" on storage.objects;
create policy "meow: trailer frames read by admin" on storage.objects for select to authenticated
  using (bucket_id = 'meow-site-assets' and name like 'videos/trailer/%' and (select public.meow_is_admin()));

drop policy if exists "meow: trailer frames insert by admin" on storage.objects;
create policy "meow: trailer frames insert by admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'meow-site-assets' and name like 'videos/trailer/%' and (select public.meow_is_admin()));
