-- 0022｜修正前台 3D 房間的 storage 權限（#161，珮瑜 2026-11-05 已在正式資料庫執行）
-- 0017 的子查詢寫 foldername(name)，name 會先對到 meow_households.name（喵戶名稱）而不是檔案路徑，
-- 喵戶長上傳影片一律被擋（new row violates row-level security policy）。改成 objects.name。可重複執行。

drop policy if exists "meow: home videos own" on storage.objects;
create policy "meow: home videos own" on storage.objects for all to authenticated
  using (bucket_id = 'meow-home-videos' and exists (
    select 1 from public.meow_households h where h.id::text = (storage.foldername(objects.name))[1] and h.owner_id = auth.uid()))
  with check (bucket_id = 'meow-home-videos' and exists (
    select 1 from public.meow_households h where h.id::text = (storage.foldername(objects.name))[1] and h.owner_id = auth.uid()));

drop policy if exists "meow: home scenes read own" on storage.objects;
create policy "meow: home scenes read own" on storage.objects for select to authenticated
  using (bucket_id = 'meow-home-scenes' and exists (
    select 1 from public.meow_households h where h.id::text = (storage.foldername(objects.name))[1] and h.owner_id = auth.uid()));
