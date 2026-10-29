-- MeowHQ｜網站外觀：Logo 上傳與網站設定（Issue #23，規格書 §4.3）
-- 共用專案規則（AGENTS.md §7）：只建立／修改 meow_ 開頭的物件、meow- 開頭的 bucket、meow: 開頭的 storage policy；可重複執行。
-- ⚠ 執行前須經 Tina 確認（AGENTS.md §7.4）。

-- =========================================================
-- 1. Storage bucket：meow-site-assets（公開讀取，上限 1 MB，只收圖片）
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meow-site-assets', 'meow-site-assets', true, 1048576, array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 只有系統管理員能上傳、覆蓋、刪除、列出檔案（一般人經公開網址讀取，由 public bucket 提供；刪除與覆蓋需要 select 權限）
drop policy if exists "meow: site assets read by system admin" on storage.objects;
create policy "meow: site assets read by system admin" on storage.objects for select to authenticated
  using (bucket_id = 'meow-site-assets' and (select public.meow_is_system_admin()));
drop policy if exists "meow: site assets insert by system admin" on storage.objects;
create policy "meow: site assets insert by system admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'meow-site-assets' and (select public.meow_is_system_admin()));
drop policy if exists "meow: site assets update by system admin" on storage.objects;
create policy "meow: site assets update by system admin" on storage.objects for update to authenticated
  using (bucket_id = 'meow-site-assets' and (select public.meow_is_system_admin()))
  with check (bucket_id = 'meow-site-assets' and (select public.meow_is_system_admin()));
drop policy if exists "meow: site assets delete by system admin" on storage.objects;
create policy "meow: site assets delete by system admin" on storage.objects for delete to authenticated
  using (bucket_id = 'meow-site-assets' and (select public.meow_is_system_admin()));

-- =========================================================
-- 2. 稽核日誌新增動作 update_setting（網站設定變更）
-- =========================================================
alter table public.meow_audit_logs drop constraint if exists meow_audit_logs_action_check;
alter table public.meow_audit_logs add constraint meow_audit_logs_action_check check (action in (
  'suspend', 'unsuspend', 'revoke_grant', 'revoke_badge', 'takedown', 'relist', 'ban', 'unban',
  'grant_module', 'grant_badge', 'set_role', 'update_setting'));

-- =========================================================
-- 3. 變更網站設定（僅系統管理員；原因必填；寫稽核日誌）
--    logo：內建代號（house／round／line）或上傳檔案的公開網址（非空字串）
--    demo_speed：Demo 加速模式（布林）
-- =========================================================
create or replace function public.meow_set_site_setting(p_key text, p_value jsonb, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.meow_is_system_admin() then raise exception 'need_system_admin' using hint = '需由系統管理員處理'; end if;
  perform public.meow_hq_require_reason(p_reason);
  if p_key is null or p_key not in ('logo', 'demo_speed') then raise exception 'invalid_key' using hint = '不支援的設定項目'; end if;
  if p_key = 'logo' and (jsonb_typeof(p_value) is distinct from 'string' or btrim(p_value #>> '{}') = '') then
    raise exception 'invalid_value' using hint = 'Logo 設定值不正確';
  end if;
  if p_key = 'demo_speed' and jsonb_typeof(p_value) is distinct from 'boolean' then
    raise exception 'invalid_value' using hint = 'Demo 加速模式只能是開或關';
  end if;
  insert into public.meow_site_settings (key, value, updated_at, updated_by) values (p_key, p_value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  perform public.meow_hq_log('update_setting', 'setting', p_key, p_reason, jsonb_build_object('key', p_key, 'value', p_value));
end $$;

revoke execute on function public.meow_set_site_setting(text, jsonb, text) from public, anon;
grant execute on function public.meow_set_site_setting(text, jsonb, text) to authenticated;
