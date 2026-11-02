-- MeowHQ｜紋理貼圖人工確認的稽核動作（Issue #129）
-- 共用專案規則（AGENTS.md §7）：只修改 meow_ 開頭的物件；可重複執行。
-- ⚠ 執行前須經 Tina 確認（AGENTS.md §7.4）。
-- 沒執行前：確認功能照常可用，只是 confirm_texture 稽核寫不進去（伺服器留警告，不擋操作）。
-- 確認狀態存在 meow_cat_models.profile.confirmed_albedo（jsonb），不需要改資料表。

alter table public.meow_audit_logs drop constraint if exists meow_audit_logs_action_check;
alter table public.meow_audit_logs add constraint meow_audit_logs_action_check check (action in (
  'suspend', 'unsuspend', 'revoke_grant', 'revoke_badge', 'takedown', 'relist', 'ban', 'unban',
  'grant_module', 'grant_badge', 'set_role', 'update_setting',
  'generate_model', 'publish_model', 'unpublish_model', 'delete_model', 'restore_texture', 'confirm_texture'));
