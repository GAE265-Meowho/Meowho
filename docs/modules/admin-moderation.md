# 模組：後台與內容審核（admin-moderation）

> 最後更新：2026-10-28｜Tina × Claude Code
> 規則：本檔隨程式碼同一個 PR 更新；「決策」與「地雷」只增不刪（過時的標註［已失效］）。

## 目的
管理員後台（知識庫、產品價格、中途認證、檢舉、Demo 模式、站台標誌）與 AI 內容審核。

## 負責
主責：C、E｜支援：B

## 對應需求
- SRS：M15（FR-15-*）、M16（FR-16-*）
- 測試：UT-15-*、UT-16-*、MT-15-*、MT-16-*、E2E-06、E2E-07
- PLAN 任務：17、23（MeowHQ 階段 0＝T-HQ-01，Issue #18）
- MeowHQ 規格：`docs/hq/01～03`

## 目前狀態
隱藏後台 `/mh-console-8k2p` 已完成（Issue #3）：中途認證審核、管理員授權／移除、網站標誌（存 `site_settings`）。頁尾的管理者設定入口已移除。檢舉與內容審核尚未開始。
MeowHQ（`/MeowHQ`，取代隱藏後台）開發中：階段 0（共用型別與資料表草案，Issue #18）已完成待審；階段 1 起尚未開工，需等 #18 合併。T-HQ-11（虛擬體驗元件管理）等 Issue #15 決定儲存位置。
MeowHQ 外殼（Issue #21，T-HQ-05、06）：路由／大小寫導向（middleware）／登入閘門／Nordic Meow 樣式／頂列／側欄／toast／空白、載入、錯誤、離線元件／白話錯誤已完成待審（`src/app/MeowHQ/`、`src/components/hq/`；測試 UT-HQ-12～16、41～43、46～48）。權限判斷為 stub，待 #20 改接；舊 `/mh-console-8k2p` 先保留（Tina 決定），#24 合併時刪除並恢復 UT-HQ-15；`Auth.tsx` 的 `isAdmin` 已改為 admin 或 system_admin（`src/lib/auth-role.ts`）。

## 資料表（Supabase）
- 已建立（`0001_meow.sql`）：`meow_shelter_verifications`（同一貓戶同時只能一筆審核中）、`meow_notifications`、`meow_site_settings`（key/value，公開讀、管理員寫）
- `meow_profiles.role`（member/admin）、`meow_profiles.email`
- 待建立：`reports`

### 0002_meow_hq.sql 草案（MeowHQ 階段 0，T-HQ-01；**草案，尚未建立 migration、尚未執行**）

> 依據：規格書 §3、§4.5、§4.6、R1～R8；決策 003。供階段 1 的 db Issue（T-HQ-02）實作；欄位若有調整，由 db Issue 更新本節。
> 全部 `meow_` 開頭；每張表啟用 RLS；migration 須可重複執行；寫入一律經 `security definer` 函式，前端只用 anon key。
> 後台模組代號與 `src/lib/hq/types.ts` 的 `ADMIN_MODULES` 相同。

**既有表變更**
| 物件 | 變更 |
|---|---|
| `meow_profiles.role` | check 改為 `('member','admin','system_admin')`；現有 `admin` 資料遷移：一律視為 `system_admin`（Tina 已同意，目前只有她一位 admin） |
| `meow_profiles` 新增欄位 | `suspended_at timestamptz`、`suspended_until timestamptz`（null＝直到手動解除）；是否停權＝`suspended_at is not null and (suspended_until is null or suspended_until > now())` |

**新資料表**
| 資料表 | 欄位（草案） | RLS |
|---|---|---|
| `meow_admin_module_grants` | `id uuid pk`、`admin_id uuid → meow_profiles`、`module text check in (可授權的 5 個模組，不含 admin_authorization)`、`granted_by uuid`、`granted_at timestamptz`；unique(`admin_id`,`module`) | 管理員只讀自己的列；系統管理員讀全部；寫入只經函式 |
| `meow_audit_logs` | `id bigint identity pk`、`actor_id uuid`、`action text`（處置類型或授權／徽章變更）、`target_type text`、`target_id text`、`reason text not null check (char_length(trim(reason)) > 0)`、`detail jsonb`、`created_at timestamptz default now()` | 管理員只讀自己（`actor_id`）的列；系統管理員讀全部；**禁止 update／delete（含系統管理員）**，以 trigger 擋下；只能經函式 insert |
| `meow_user_suspensions` | `id uuid pk`、`user_id uuid`、`reason text not null`、`suspended_by uuid`、`suspended_at`、`until timestamptz`（null＝直到手動解除）、`lifted_by uuid`、`lifted_at`、`lift_reason text`；同一帳號同時只有一筆生效中 | 有「用戶權限管理」者與系統管理員讀；寫入只經函式 |
| `meow_banlist` | `id uuid pk`、`google_email text not null unique`（小寫）、`reason text not null`、`banned_by uuid`、`banned_at`、`lifted_by`、`lifted_at`、`lift_reason` | 僅系統管理員讀寫（函式） |

**函式（`security definer`，每次呼叫都重新判斷權限）**
| 函式 | 說明 | 對應測試 |
|---|---|---|
| `meow_is_system_admin()` | 呼叫者是否系統管理員 | — |
| `meow_has_module(module text)` | 系統管理員恆為 true；管理員看授權表；且未被停權 | UT-HQDB-01、10 |
| `meow_is_admin()` | 改為 `role in ('admin','system_admin')`（保留舊名，避免既有 policy 失效） | — |
| `meow_grant_module(admin_id, module, reason)`／`meow_revoke_module(admin_id, module, reason)` | 僅系統管理員；不可授予 `admin_authorization`；寫稽核日誌 | UT-HQDB-06 |
| `meow_set_role(target_email, role, reason)` | 取代 `meow_set_admin`；僅系統管理員；撤銷最後一位系統管理員時拋例外 | UT-HQDB-09 |
| `meow_suspend_user(user_id, reason, until)`／`meow_unsuspend_user(user_id, reason)` | 需「用戶權限管理」；對象是管理員時須為系統管理員，並清空其模組授權；對象是系統管理員一律拒絕；原因必填；停權時自動婉拒審核中領養申請並通知（領養申請表建立後啟用） | UT-HQDB-01～05、12 |
| `meow_ban_email(email, reason)`／`meow_unban_email(email, reason)` | 僅系統管理員；建議黑名單同時記錄 `auth.users.id`（審查建議，由 #19 決定） | UT-HQDB-06 |
| `meow_review_verification(...)` | 既有函式；改為需「用戶權限管理」；撤銷徽章函式 `meow_revoke_badge(household_id, reason)` 同樣需原因並寫日誌 | UT-HQDB-06 |
| `meow_notify_module(module text, type text, payload jsonb)` | 通知有該模組權限者＋全部系統管理員（取代「通知所有管理員」的 trigger） | UT-HQ-39、40 |
| 登入建立會員資料檢查 | `meow_profiles` insert 時（網站第一次登入）若 email 在黑名單則拒絕；**不可在 `auth.users` 加 trigger**（AGENTS.md §7.3） | UT-HQDB-11 |

**稽核日誌 `action` 值（草案）**：`suspend`、`unsuspend`、`revoke_grant`、`revoke_badge`、`takedown`、`relist`、`ban`、`unban`（同 `HqDisposition`，共 8 種），另加授予類 `grant_module`、`grant_badge`、`set_role`（不是處置，只作稽核日誌 action；Tina 已同意）。

**已確認（Tina 同意審查建議）**
1. 現有 `admin` 一律遷移為 `system_admin`。
2. `unban` 納入處置類型；`grant_module`、`grant_badge`、`set_role` 不納入，只作稽核日誌 action。
3. 以 `revoke execute ... from anon` 收緊四個 SECURITY DEFINER 函式，併入 T-HQ-02（#19）。\n4. 停權狀態建議只以 `meow_user_suspensions` 為單一來源（生效中＝未解除且未到期），`meow_profiles` 的 `suspended_*` 欄位是否保留由 #19 決定（審查建議）。

## API／主要函式
- 資料庫函式：`meow_is_admin()`、`meow_set_admin(email, bool)`、`meow_review_verification(id, approve, note)`（核准時給徽章並通知申請人）
- trigger：送出認證申請 → 通知所有管理員；角色與 `verified_shelter` 只能由管理員變更
- 前端：`src/app/mh-console-8k2p/page.tsx`、`src/components/VerificationApply.tsx`（貓戶長申請）、`src/lib/verification.ts`
- 待建立：檢舉處理、影像與文字審核

## 主要檔案
- `src/lib/hq/types.ts`（MeowHQ 共用約定：模組代號、角色、處置類型、快選原因、錯誤代碼、側欄順序；T-HQ-01）、`src/lib/hq/types.test.ts`
- `src/components/Providers.tsx`（從 `site_settings` 讀取標誌、`setLogo` 寫入）、`src/lib/mock-data.ts`（`LOGOS`）

## 決策
- 不更換 logo 檔案，只能由管理者在 3 款中選擇。
- 後台用隱藏網址、不放任何連結；安全性靠 RLS 與 security definer 函式，不靠網址。
- 第一位管理員用 SQL 指定，之後在後台以 Email 授權（對方需先登入過一次）。
- 認證機制目前由管理員人工審核。

- 2026-10-28｜後台權限改為「系統管理員按模組授權」，後台分 6 個模組；第一位系統管理員以 SQL 指定；黑名單僅系統管理員；所有管理動作寫入稽核日誌。見 `docs/decisions/003-module-based-admin-authorization.md`。目前程式仍是 member／admin 兩種角色，待 PLAN 任務 23 調整。

- 2026-10-28｜MeowHQ 階段 0（Issue #18）：模組代號用英文（`report_moderation`、`user_management`、`products`、`knowledge`、`virtual_assets`、`admin_authorization`），中文名稱放 `ADMIN_MODULE_LABELS`；「貓友」「貓戶長」不是角色（角色只有 `system_admin`／`admin`／`member`）。

## 待確認
- 停權單一來源、黑名單記 `auth.users.id`：交給 #19 決定。
- 規格書 §4.7 只列停權、下架、撤銷的快選原因；解除停權、重新上架、加入／移出黑名單目前為空清單。

## 地雷
- 隱藏網址若外流，非管理員仍讀不到任何資料，但要避免在文件、聊天群組外公開。
- 管理員不能移除自己的權限（避免沒有管理員）。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
| 2026-10-28 | Tina × Claude Code | 隱藏後台、中途認證審核、管理員授權、站台標誌存資料庫、站內通知 | #3 |
| 2026-10-28 | Tina × Cursor | MeowHQ 階段 0：`src/lib/hq/types.ts` 與測試（8 種處置含 `unban`）、0002 資料表草案 | #18 |
