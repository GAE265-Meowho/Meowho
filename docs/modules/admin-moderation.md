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
MeowHQ（`/MeowHQ`，取代舊隱藏後台）開發中：階段 0（#18）、db（#19，`0002_meow_hq.sql`）、logic（#20）已合併；外殼（#21）：路由／大小寫導向／登入閘門／Nordic Meow 樣式／頂列／側欄／toast／空白、載入、錯誤、離線元件；側欄改接 `permissions.ts`。舊後台 `/mh-console-8k2p` 已移除（Tina 2026-10-29 決定），功能移到 #23（管理員授權、網站外觀）、#24（中途認證）。`Auth.tsx` 的 `isAdmin` 為 admin 或 system_admin（`src/lib/auth-role.ts`）。T-HQ-11（虛擬體驗元件管理—貓咪模型）由 Issue #75 進行：規格 `docs/hq/04_assets-cat-models規格書.md`，儲存位置定為 Supabase Storage（解決 #15）；PR 2a 已有 `/MeowHQ/assets` 四個分頁、貓咪列表、貓咪頁 `/MeowHQ/assets/cats/<id>`（本機檔案來源，需設 `CAT_STUDIO_ROOT`，見 `.env.example`）。
2026-10-29：`0002_meow_hq.sql` 已在 Supabase 執行。#22：待辦總覽（`/MeowHQ`）、列表共用元件（`src/components/hq/list/HqList.tsx`）、模組守門（`HqModuleGuard`）、側欄改接 `permissions.ts`（授權讀取中只顯示首頁，不再退回全部可見）、資料庫錯誤轉白話（`hqErrorMessage`，優先顯示函式 hint）。

## 資料表（Supabase）
- 已建立（`0001_meow.sql`）：`meow_shelter_verifications`（同一貓戶同時只能一筆審核中）、`meow_notifications`、`meow_site_settings`（key/value，公開讀、管理員寫）
- `meow_profiles.role`（0001：member/admin；0002 起：member/admin/system_admin）、`meow_profiles.email`
- 0002（尚未執行）新增：`meow_admin_module_grants`、`meow_audit_logs`、`meow_user_suspensions`、`meow_banlist`（見下）\n- 待建立：`reports`

### 0002_meow_hq.sql（MeowHQ，T-HQ-02，Issue #19；**已寫成檔案，尚未在 Supabase 執行**）

> 檔案：`supabase/migrations/0002_meow_hq.sql`（可重複執行）；測試：`supabase/tests/0002_meow_hq.test.sql`，以 `node supabase/tests/run-pglite.mjs` 在本機臨時資料庫執行（先 `npm i --no-save @electric-sql/pglite`），不連 Supabase。
> 對應測試：UT-HQDB-01～13（12 暫跳過，待領養申請表）、UT-HQ-39～40。結果：101 通過、1 跳過。

**既有表變更**
| 物件 | 變更 |
|---|---|
| `meow_profiles.role` | check 改為 `member／admin／system_admin`；現有 `admin` 一律升為 `system_admin`（只在尚未升級時執行一次，重跑不會再升級；Tina 已同意） |
| 停權狀態 | 只以 `meow_user_suspensions` 為準；`meow_profiles` **不**加欄位（審查建議） |
| `meow_guard_profile` | 角色只能經 `meow_set_role` 變更；黑名單帳號不能建立會員資料；**修正 0001 的錯誤**：更新別人的資料時不再把 Email 蓋成操作者的 |
| `meow_protect_verified` | 改為需「用戶權限管理」模組 |
| `meow_notify_admins_verification` | 改為只通知有「用戶權限管理」者＋全部系統管理員 |
| RLS | 管理員讀取全部會員／貓戶／認證申請改為需「用戶權限管理」；網站設定寫入限系統管理員；相關 policy 改為 `to authenticated`（匿名訪客不會呼叫權限函式） |

**新資料表**（全部啟用 RLS；前端只能 select，寫入一律經函式）
| 資料表 | 用途與重點 | 誰能讀 |
|---|---|---|
| `meow_admin_module_grants` | 管理員的模組授權（不含 `admin_authorization`）；unique(admin_id, module) | 自己的列；系統管理員全部 |
| `meow_audit_logs` | 稽核日誌：actor、action、對象、原因（必填）、detail；**update／delete／truncate 一律擋下（含擁有者）**，不設外鍵 | 自己的列（須為管理員）；系統管理員全部 |
| `meow_user_suspensions` | 停權紀錄（原因、期限、解除者與原因）；同一帳號只能有一筆未解除 | 本人；有「用戶權限管理」者 |
| `meow_banlist` | 黑名單：`google_email`（去空白小寫）、`auth_user_id`、原因；可移出（保留紀錄）；**只用於貓友與貓戶長，管理員與系統管理員不能加入** | 系統管理員 |

**函式**（`security definer`，每次呼叫重新判斷權限；錯誤以代碼回報：`permission_denied`、`need_system_admin`、`target_is_system_admin`、`target_is_admin`、`target_suspended`、`target_not_admin`、`reason_required`、`last_system_admin`、`module_not_grantable`、`invalid_role`、`invalid_until`、`invalid_email`、`already_suspended`、`not_suspended`、`already_banned`、`banned`、`role_change_via_function_only`、`audit_logs_immutable`、`not_found`）
| 函式 | 說明 |
|---|---|
| `meow_is_system_admin()`、`meow_is_admin()`、`meow_has_module(module)` | 權限判斷；系統管理員恆有全部模組，管理員看授權且未停權，Admin 授權只有系統管理員 |
| `meow_grant_module`／`meow_revoke_module(admin_id, module, reason)` | 僅系統管理員；不可授予 `admin_authorization`；只能授予管理員 |
| `meow_set_role(email, role, reason)` | 僅系統管理員；降級會清空授權；撤銷最後一位系統管理員由 trigger 擋下。`meow_set_admin(email, bool)` 保留舊介面並轉呼叫它 |
| `meow_suspend_user(user_id, reason, until)`／`meow_unsuspend_user(user_id, reason)` | 需「用戶權限管理」；對象是管理員須為系統管理員並清空其授權；系統管理員不能被停權。R1 自動婉拒領養申請待領養申請表建立後補（UT-HQDB-12） |
| `meow_ban_email`／`meow_unban_email(email, reason)` | 僅系統管理員；不能封鎖系統管理員的帳號 |
| `meow_review_verification(id, approve, note)`、`meow_revoke_badge(household_id, reason)` | 需「用戶權限管理」；授予／撤銷徽章寫稽核日誌 |
| `meow_notify_module(module, type, title, body, link)` | 內部用；通知對象＝有該模組權限者＋全部系統管理員（前端不能呼叫） |

**稽核日誌 action（11 種）**：`suspend`、`unsuspend`、`revoke_grant`、`revoke_badge`、`takedown`、`relist`、`ban`、`unban`（同 `HqDisposition`），另有授予類 `grant_module`、`grant_badge`、`set_role`（不是處置，只作日誌）。`takedown`、`relist` 的函式屬內容審核與元件管理模組，由各模組 Issue 實作。

**函式執行權**：上述後台函式與 `meow_is_admin`、`meow_set_admin`、`meow_review_verification` 已收回 `anon`／`PUBLIC`，只開放 `authenticated`；內部函式與 trigger 函式不開放給前端。

## API／主要函式
- 資料庫函式：`meow_is_admin()`、`meow_set_admin(email, bool)`、`meow_review_verification(id, approve, note)`（核准時給徽章並通知申請人）
- trigger：送出認證申請 → 通知所有管理員；角色與 `verified_shelter` 只能由管理員變更
- 前端：`src/app/mh-console-8k2p/page.tsx`、`src/components/VerificationApply.tsx`（貓戶長申請）、`src/lib/verification.ts`
- 待建立：檢舉處理、影像與文字審核

## 主要檔案
- `src/lib/hq/types.ts`（MeowHQ 共用約定：模組代號、角色、處置類型、快選原因、錯誤代碼、側欄順序；T-HQ-01）、`src/lib/hq/types.test.ts`
- `src/lib/hq/permissions.ts`（可見模組、存取、`canSuspend`／`canBan`／最後一位系統管理員／授予限制；T-HQ-03）、`src/lib/hq/actions.ts`（原因必填、停權期限與到期、影響說明、黑名單 Email 確認、快選原因；含 R9～R11；T-HQ-04）及其測試（UT-HQ-01～11、17～28），Issue #20
- `src/components/Providers.tsx`（從 `site_settings` 讀取標誌、`setLogo` 寫入）、`src/lib/mock-data.ts`（`LOGOS`）

## 決策
- 不更換 logo 檔案，只能由管理者在 3 款中選擇。
- 後台用隱藏網址、不放任何連結；安全性靠 RLS 與 security definer 函式，不靠網址。
- 第一位管理員用 SQL 指定，之後在後台以 Email 授權（對方需先登入過一次）。
- 認證機制目前由管理員人工審核。

- 2026-10-28｜後台權限改為「系統管理員按模組授權」，後台分 6 個模組；第一位系統管理員以 SQL 指定；黑名單僅系統管理員；所有管理動作寫入稽核日誌。見 `docs/decisions/003-module-based-admin-authorization.md`。資料庫面由 `0002_meow_hq.sql` 實作（Issue #19）；前端待 #21 等調整。

- 2026-10-28｜MeowHQ 階段 0（Issue #18）：模組代號用英文（`report_moderation`、`user_management`、`products`、`knowledge`、`virtual_assets`、`admin_authorization`），中文名稱放 `ADMIN_MODULE_LABELS`；「貓友」「貓戶長」不是角色（角色只有 `system_admin`／`admin`／`member`）。

- 2026-10-29｜0002（Issue #19）：停權狀態只存在 `meow_user_suspensions`（profiles 不加欄位）；黑名單同時記 `auth_user_id`；角色只能經 `meow_set_role` 變更（`meow.hq_fn` 旗標，僅在該 update 期間有效）；稽核日誌連資料表擁有者都不能改刪；錯誤以代碼回報；收回 `anon`／`PUBLIC` 執行權的同時，把會被匿名訪客觸發的 policy 改為 `to authenticated`，避免 `meow_is_admin` 等被收回後匿名讀取公開貓戶出錯。

## 待確認
- 黑名單加入「已登入的現有會員」後是否同時強制登出或停權？目前只擋新建會員資料（UT-HQDB-11）；登入阻擋屬前端／Auth 層，待 #21 或另案。
- 停權中的會員能使用哪些前台功能（寫入類 RLS 尚未依停權收緊），待另案。
- 規格書 §4.7 只列停權、下架、撤銷的快選原因；解除停權、重新上架、加入／移出黑名單目前為空清單。

## 地雷
- **執行 0002 後，舊隱藏後台 `/mh-console-8k2p` 與前台 `isAdmin` 會失效**：`src/components/Auth.tsx` 以 `role === "admin"` 判斷管理員，而現有 admin 會升為 `system_admin`；舊後台列管理員的查詢也是 `.eq("role", "admin")`。在 #21（shell）把前端改成新角色之前，不建議在正式環境執行 0002，或由 Tina 決定先接受舊後台暫時不可用。
ole === "admin" 判斷管理員，而現有 admin 會升為 system_admin；舊後台列管理員的查詢也是 eq("role", "admin")。在 #21（shell）把前端改成新角色之前，不建議在正式環境執行 0002，或由 Tina 決定先接受舊後台暫時不可用。
- 隱藏網址若外流，非管理員仍讀不到任何資料，但要避免在文件、聊天群組外公開。
- ~~管理員不能移除自己的權限~~［已失效，0002 起改為「不能移除最後一位系統管理員」，由 trigger 保證］

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
| 2026-10-28 | Tina × Claude Code | 隱藏後台、中途認證審核、管理員授權、站台標誌存資料庫、站內通知 | #3 |
| 2026-10-28 | Tina × Cursor | MeowHQ 階段 0：`src/lib/hq/types.ts` 與測試（8 種處置含 `unban`）、0002 資料表草案 | #18 |
| 2026-10-29 | Tina × Cursor | MeowHQ 階段 1 db：`0002_meow_hq.sql`、`supabase/tests/`（SQL 測試與本機執行器） | #19 |
- 2026-10-29｜#26 審查修正：黑名單只用於貓友與貓戶長，`meow_ban_email` 拒絕管理員（`target_is_admin`）；`meow_set_role` 拒絕把停權中的帳號升為管理員（`target_suspended`）；註冊時黑名單同時比對 Email 與 `auth_user_id`；兩個內部函式補 `search_path`；policy 內的權限函式改包 `(select ...)`。
- 2026-10-29｜依規格書 R9（#30）：`meow_ban_email` 對尚未建立會員資料的 Email 回 `not_found`，不能預先封禁；UT-HQDB-11 改為「會員資料被刪除後，黑名單帳號重新建立會員資料 → 拒絕」。

| 2026-10-29 | Tina × Cursor | MeowHQ 階段 1 logic：permissions.ts、actions.ts 與測試（R9～R11） | #20 |
- 2026-10-29｜#20：黑名單只用於貓友與貓戶長，`canBan` 拒絕管理員與系統管理員（與 #26 的 `meow_ban_email` 一致）；規格書 R9 待 Tina 更新。
| 2026-10-29 | Tina × Claude Code | #23 Admin 授權：`/MeowHQ/admin`（授權矩陣、稽核日誌、統計、網站設定）、`0003_meow_site_assets.sql`（bucket `meow-site-assets`、`meow_set_site_setting`、稽核動作 `update_setting`；待執行）、通知鈴鐺 | #23 |

| 2026-10-29 | Tina × Claude Code | MeowHQ #24 用戶權限管理 `/MeowHQ/users`：帳號（停權、黑名單）、中途認證（核准、退回、撤銷徽章）；`src/lib/hq/users.ts`、`src/components/hq/users/`；UT-HQ-44、45 | #24 |
| 2026-10-31 | Tina × Cursor | #75 虛擬體驗元件管理 PR 2a：`/MeowHQ/assets` 四分頁、貓咪列表、貓咪頁（3D 預覽、動作清單、上下架）、本機檔案實作與 `/api/hq/cat-models`；`src/lib/hq/cat-models/`、`src/components/hq/assets/` | #75 |
- 2026-10-29｜#24：前端呼叫 `meow_suspend_user`／`meow_unsuspend_user`／`meow_ban_email`／`meow_unban_email`／`meow_review_verification`／`meow_revoke_badge`；「要求補件」不另設狀態，用退回＋快選原因「退回並要求補件」；黑名單狀態只有系統管理員讀得到（RLS），其他管理員看不到黑名單欄與操作。

- 2026-10-31｜#75：虛擬體驗元件分四個區塊（貓咪、室內空間、生活用品、其他），R3 已改寫；貓咪模型的貼圖由 cat_studio/paint_worker.py 產生，網頁只建任務與預覽（共用母體 ase_clips.glb 換 cat_fur 貼圖，不需每隻貓各一個 glb）；動作屬母體，補入新動作後所有貓自動擁有；本機模式 API 只在非 production 且設了 CAT_STUDIO_ROOT 時啟用，其餘一律 404。 004_meow_cat_models.sql（資料表 meow_cat_models、meow_cat_model_jobs、bucket meow-cat-photos／meow-cat-models）在 PR 3，執行前須經 Tina 確認。
