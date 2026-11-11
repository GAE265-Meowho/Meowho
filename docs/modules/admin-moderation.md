# 模組：後台與內容審核（admin-moderation）

> 最後更新：2026-11-05｜Tina × Cursor
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
- **#218／#222／#224／#226 KPI Dashboard**：`/MeowHQ` 營運總覽＋待辦；#222 去最近動作、0023 未執行不掃 Storage；#224 進頁只載一次；#226 卡片去雜訊、頂部全域抓取時間、主數值放大。API `GET /api/hq/dashboard`。定義見 `docs/hq/06_kpi-dashboard.md`。`0023` **尚未執行**。付費貓咪／Vercel Observability 尚未啟用。
隱藏後台 `/mh-console-8k2p` 已完成（Issue #3）：中途認證審核、管理員授權／移除、網站標誌（存 `site_settings`）。頁尾的管理者設定入口已移除。檢舉與內容審核尚未開始。
MeowHQ（`/MeowHQ`，取代舊隱藏後台）開發中：階段 0（#18）、db（#19，`0002_meow_hq.sql`）、logic（#20）已合併；外殼（#21）：路由／大小寫導向／登入閘門／Nordic Meow 樣式／頂列／側欄／toast／空白、載入、錯誤、離線元件；側欄改接 `permissions.ts`。舊後台 `/mh-console-8k2p` 已移除（Tina 2026-10-29 決定），功能移到 #23（管理員授權、網站外觀）、#24（中途認證）。`Auth.tsx` 的 `isAdmin` 為 admin 或 system_admin（`src/lib/auth-role.ts`）。T-HQ-11（虛擬體驗元件管理—貓咪模型）由 Issue #75 進行：規格 `docs/hq/04_assets-cat-models規格書.md`，儲存位置定為 Supabase Storage（解決 #15）；PR 2a、2b 已有 `/MeowHQ/assets` 四個分頁、貓咪列表、新增貓咪 `/cats/new`、貓咪頁 `/cats/<id>`、貼圖工作頁 `/cats/<id>/studio`（本機檔案來源，需設 `CAT_STUDIO_ROOT`，見 `.env.example`）。
2026-10-29：`0002_meow_hq.sql` 已在 Supabase 執行。#22：待辦總覽（`/MeowHQ`）、列表共用元件（`src/components/hq/list/HqList.tsx`）、模組守門（`HqModuleGuard`）、側欄改接 `permissions.ts`（授權讀取中只顯示首頁，不再退回全部可見）、資料庫錯誤轉白話（`hqErrorMessage`，優先顯示函式 hint）。

2026-11-02（#93）：虛擬體驗元件管理「室內空間」新增**影片轉換**：管理員上傳影片建立工作，本機 worker 轉換後在後台查看 3D 房間，貓咪可走路、跳上床、推倒杯子。檢視器 `src/components/hq/assets/RoomViewer.tsx`，互動 `src/lib/hq/rooms/world.ts`（`cat.js`、`physics.js`、`audio.js` 來自影片轉 3D 專案）。

## 資料表（Supabase）
- `0014_meow_room_models.sql`（**尚未執行，須 Tina 確認**）：`meow_room_models`、`meow_room_jobs`；只有 `virtual_assets` 能讀寫，worker 用 service role。Bucket：`meow-room-videos`（私有）、`meow-room-models`（公開），見決策 008。
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

2026-11-04（#179）：側欄新增**貓戶管理**（`/MeowHQ/households`），依類別（個人中途／立案協會／收容單位／一般飼主）查看所有貓戶，可搜尋；點一戶看詳情與貓咪卡片。是可授權模組 `households`（Tina：之後要能在 Admin 授權調整），`0020_meow_households_module.sql` 上線時把現有管理員全部授權；第一版唯讀。

## API／主要函式
- 貓戶管理（#179）：頁面以登入者身分直讀 `meow_households`、`meow_cats`、`meow_profiles`；0020 新增 policy「read by households module」讓有此模組者讀全部。整理邏輯 `src/lib/hq/households.ts`。
- 資料庫函式：`meow_is_admin()`、`meow_set_admin(email, bool)`、`meow_review_verification(id, approve, note)`（核准時給徽章並通知申請人）
- trigger：送出認證申請 → 通知所有管理員；角色與 `verified_shelter` 只能由管理員變更
- 前端：`src/app/mh-console-8k2p/page.tsx`、`src/components/VerificationApply.tsx`（貓戶長申請）、`src/lib/verification.ts`
- 待建立：檢舉處理、影像與文字審核

## 主要檔案
- `src/lib/hq/types.ts`（MeowHQ 共用約定：模組代號、角色、處置類型、快選原因、錯誤代碼、側欄順序；T-HQ-01）、`src/lib/hq/types.test.ts`
- `src/lib/hq/permissions.ts`（可見模組、存取、`canSuspend`／`canBan`／最後一位系統管理員／授予限制；T-HQ-03）、`src/lib/hq/actions.ts`（原因必填、停權期限與到期、影響說明、黑名單 Email 確認、快選原因；含 R9～R11；T-HQ-04）及其測試（UT-HQ-01～11、17～28），Issue #20
- `src/components/Providers.tsx`（從 `site_settings` 讀取標誌、`setLogo` 寫入）、`src/lib/mock-data.ts`（`LOGOS`）

## 3D 貓咪母體模型位置（體型骨架）

> 2026-11-11 Tina × Claude Code（#365）整理，之後找母體先看這裡。母體＝所有貓共用的網格＋骨架＋動作，每隻貓只換身體貼圖（材質 `cat_fur`）。

| 體型 | 網頁用的 glb（repo） | 正式站 Storage | 製作原始檔（Tina 電腦，**不是 git repo**） | 產生腳本 |
|---|---|---|---|---|
| 成貓（`adult`） | `public/hq-cat-models/base/base_clips.glb` | `meow-cat-models/base/v1/base_clips.glb`（改完要手動上傳覆蓋） | `C:\TinaLee\Projects\GAE265\Meow\cat_base\work\`：`base_rig.blend`（綁骨後）、`base_clips.blend`（含動作） | `Meow\cat_base\stepB_rig.py`（骨架、權重、脊椎拉直、眨眼、鬍鬚）→ `stepC_clips.py`（動作，eat／drink 等來自 `Meow\needs_clips.py`）→ repo `node scripts/clips/eat_drink.mjs <glb> <glb> adult`（重做 eat、drink） |
| 幼貓（`kitten`） | `public/hq-cat-models/base/base_clips_kitten.glb` | 不在 Storage，直接用 repo 檔 | `Meow\cat_base_kitten\work\` | `Meow\cat_base_kitten\stepB_rig.py`、`stepC_clips.py` → `eat_drink.mjs … kitten` |
| 大貓（預覽用） | `public/hq-cat-models/base/base_clips_large.glb` | 不在 Storage | `Meow\配件模型\cat_base_large\cat_base_large.blend` | `Meow\配件模型\cat_base_large\scripts\` |

- **怎麼認**：Blender 裡骨架物件叫 `cat_rig`、身體網格叫 `cat_base`、眼球 `eye_L`／`eye_R`、鬍鬚 `whiskers`（成貓，#365 起）。`Meow` 裡其他資料夾（`rig_output\`、`black_cat#0000\`、`output_models\`、各 `backup_*`）都是舊版或備份，不是母體。
- **上色用的網格**：`workers/cat-paint/cat_base/work/base_uv.glb`（Tina 電腦 `Meow\cat_base\work\base_uv.glb`）是綁骨前、照片姿勢的網格，Hunyuan 上色與 `step3b_fill.py` 用它；UV 與母體相同，貼圖可直接套回母體。
- **三視角投影**：`workers/cat-paint/cat_studio/project_views.py` 用拉直後的母體（Tina 電腦 `Meow\cat_base\work\base_rig.glb`，沒有時用 repo 的 `base_clips.glb`）。
- **每隻貓的貼圖**：本機 `Meow\adoption_cats\<貓咪ID>\paint_albedo.png`；線上 `meow-cat-models/cats/<貓咪ID>/`。
- **示範貓「第一隻虎斑貓」（`cat_20261030_140731`）**：不在 Supabase，是 repo 靜態檔 `public/hq-cat-models/cats/cat_20261030_140731/`（貼圖、照片、AI 三視角），資料寫在 `src/lib/hq/cat-models/bundled.ts`；要更新就換這裡的檔案並改 `bundled.ts`（#367）。製作原始檔在 Tina 電腦 `Meow\adoption_cats\cat_20261030_140731\`。
- **改母體的順序**：改 `stepB`／`stepC` → 在 Meow 用 Blender 5.2 跑 B、C（PowerShell 指令前要加 `&`）→ 複製 `base_clips.glb` 到 repo `public/hq-cat-models/base/` → 跑 `eat_drink.mjs` → 成貓再上傳 Storage。直接從 Blender 匯出會蓋掉 eat／drink 的修改；只換單一動作用 `scripts/clips/splice_clip.py`。

## 決策
- 2026-11-11｜#365：成貓母體綁骨時把脊椎與尾巴拉直（只繞 Z 轉、腳掌仍貼地），網格與 UV 不變，舊貼圖照用；鬍鬚是獨立網格掛 `head0`、不綁權重，網頁不用改。貓咪貼圖可改用 AI 三視角直接投影（`project_views.py`），照片看不到的地方才用 Hunyuan＋`step3b_fill.py` 的自然虎斑補紋。
- 2026-11-09｜#302：大貓是新增的預覽體型（`PreviewBody`），和成貓、幼貓並存，不取代現有母體；接上貓咪製作前不加進 `BodyType`。大貓模型來源 Sketchfab「Cat in Motion 3d model free」（iRahulRajput，CC-BY 4.0），畫面須保留作者與來源標註。
- 不更換 logo 檔案，只能由管理者在 3 款中選擇。
- 後台用隱藏網址、不放任何連結；安全性靠 RLS 與 security definer 函式，不靠網址。
- 第一位管理員用 SQL 指定，之後在後台以 Email 授權（對方需先登入過一次）。
- 認證機制目前由管理員人工審核。

- 2026-10-28｜後台權限改為「系統管理員按模組授權」，後台分 6 個模組；第一位系統管理員以 SQL 指定；黑名單僅系統管理員；所有管理動作寫入稽核日誌。見 `docs/decisions/003-module-based-admin-authorization.md`。資料庫面由 `0002_meow_hq.sql` 實作（Issue #19）；前端待 #21 等調整。

- 2026-10-28｜MeowHQ 階段 0（Issue #18）：模組代號用英文（`report_moderation`、`user_management`、`products`、`knowledge`、`virtual_assets`、`admin_authorization`），中文名稱放 `ADMIN_MODULE_LABELS`；「貓友」「貓戶長」不是角色（角色只有 `system_admin`／`admin`／`member`）。

- 2026-10-29｜0002（Issue #19）：停權狀態只存在 `meow_user_suspensions`（profiles 不加欄位）；黑名單同時記 `auth_user_id`；角色只能經 `meow_set_role` 變更（`meow.hq_fn` 旗標，僅在該 update 期間有效）；稽核日誌連資料表擁有者都不能改刪；錯誤以代碼回報；收回 `anon`／`PUBLIC` 執行權的同時，把會被匿名訪客觸發的 policy 改為 `to authenticated`，避免 `meow_is_admin` 等被收回後匿名讀取公開貓戶出錯。

- 2026-11-04｜新增後台模組 `households`（貓戶管理，排在側欄「營運與社群」第一個）；上線時現有管理員全部授權，之後由系統管理員調整。沒有待辦，待辦總覽不顯示卡片（`NO_TODO_MODULES`）（Tina，#179）。
- 2026-11-04｜側欄樣式（#183）：群組標題 12.5px 粗體＋字距、項目 14px（選中 600＋底色＋左側色條）、群組間距 24px；「虛擬體驗元件管理」改為可收合樹狀選單（在模組內自動展開，子項目縮排＋左側引導線）（Tina）。

- 2026-11-04｜頂列加「前往前台」（鈴鐺左邊，新分頁開前台首頁；手機只顯示圖示）（Tina，#191）。

- 2026-11-04｜側欄收合：頂列「☰」所有寬度都顯示；手機是抽屜，平板與電腦按下收起整個側欄（記在瀏覽器 `meowhq:sidebar-collapsed`）（Tina，#193）。

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
| 2026-11-04 | Tina × Claude Code | MeowHQ 新增「貓戶管理」模組：依類別查看貓戶、貓咪卡片；0020 授權現有管理員 | #179 |
- 2026-10-29｜#26 審查修正：黑名單只用於貓友與貓戶長，`meow_ban_email` 拒絕管理員（`target_is_admin`）；`meow_set_role` 拒絕把停權中的帳號升為管理員（`target_suspended`）；註冊時黑名單同時比對 Email 與 `auth_user_id`；兩個內部函式補 `search_path`；policy 內的權限函式改包 `(select ...)`。
- 2026-10-29｜依規格書 R9（#30）：`meow_ban_email` 對尚未建立會員資料的 Email 回 `not_found`，不能預先封禁；UT-HQDB-11 改為「會員資料被刪除後，黑名單帳號重新建立會員資料 → 拒絕」。

| 2026-10-29 | Tina × Cursor | MeowHQ 階段 1 logic：permissions.ts、actions.ts 與測試（R9～R11） | #20 |
- 2026-10-29｜#20：黑名單只用於貓友與貓戶長，`canBan` 拒絕管理員與系統管理員（與 #26 的 `meow_ban_email` 一致）；規格書 R9 待 Tina 更新。
| 2026-10-29 | Tina × Claude Code | #23 Admin 授權：`/MeowHQ/admin`（授權矩陣、稽核日誌、統計、網站設定）、`0003_meow_site_assets.sql`（bucket `meow-site-assets`、`meow_set_site_setting`、稽核動作 `update_setting`；待執行）、通知鈴鐺 | #23 |

| 2026-10-29 | Tina × Claude Code | MeowHQ #24 用戶權限管理 `/MeowHQ/users`：帳號（停權、黑名單）、中途認證（核准、退回、撤銷徽章）；`src/lib/hq/users.ts`、`src/components/hq/users/`；UT-HQ-44、45 | #24 |
| 2026-10-31 | Tina × Cursor | #75 虛擬體驗元件管理 PR 2a：`/MeowHQ/assets` 四分頁、貓咪列表、貓咪頁（3D 預覽、動作清單、上下架）、本機檔案實作與 `/api/hq/cat-models`；`src/lib/hq/cat-models/`、`src/components/hq/assets/` | #75 |
| 2026-10-31 | Tina × Cursor | #75 虛擬體驗元件管理 PR 2b：新增貓咪 `/cats/new`、貼圖工作頁 `/cats/<id>/studio`（選項、進度、貼圖結果、改用上一版）；`local.ts` 的 `createCat`／`queuePaint`／`restorePrevious`，API `POST /api/hq/cat-models`、`[id]/paint`、`[id]/restore` | #75 |
| 2026-11-01 | Tina × Claude Code | #88 線上新增貓咪與產生 3D：Supabase 版 `sbPhotoUpload`（簽上傳網址、瀏覽器直傳）／`sbCreateCat`／`sbQueuePaint`／`sbRestore`、`POST /api/hq/cat-models/upload`；依年齡選母體（`bodyFor`、`?body=kitten`、`public/hq-cat-models/base/base_clips_kitten.glb`）；`supabase.test.ts` | #88 |
| 2026-11-01 | Tina × Claude Code | #88 貓咪分頁版面整理：上方加三步驟製作流程與「新增貓咪模型」主按鈕；「母體範本」畫面改稱「體型骨架（系統自動套用）」，卡片用標籤顯示年齡規則、預覽框標「示範毛色」；列表加「已建立的貓咪模型」標題；新增貓咪頁照片改成角度指引（側面必填，正面／背部規劃中）、年齡欄即時顯示將使用的骨架 |
| 2026-11-01 | Tina × Claude Code | #91 幼貓骨架脖子錯位修正（Meow `cat_base_kitten/stepB_rig.py`：頭部改用球形範圍、neck0 不分攤轉頭、轉正用 DQS、脖子平滑；網格與 UV 不變）並更新 `public/hq-cat-models/base/base_clips_kitten.glb`；體型骨架加「下載 GLB」（`/api/hq/cat-models/base?body=…&download=1`，Supabase 網址加 `?download=`）；貓咪頁、貼圖工作頁的畫面文字「母體」改「骨架」 | #91 |
| 2026-11-01 | Tina × Claude Code | #96 3D 編輯器工作區：骨架測試台、貓咪頁改為左側預覽固定（約 70%）、右側參數面板獨立捲動並分組摺疊（`PanelGroup`，原生 `<details>`）；桌機主區塊等於視窗高度，平板／手機上下排列、預覽黏在頂列下方。只用 CSS 切換版面，不做手機「預覽／參數」切換（會讓 Canvas 重建） | （見 PR） |
| 2026-11-01 | Tina × Claude Code | #98 新增貓咪頁加入拍攝範例照：成貓（LINE_A7_1.jpg）、幼貓（好奇虎斑小貓），縮到 480px 放在 `public/hq-cat-models/examples/` | （見 PR） |
| 2026-11-01 | Tina × Claude Code | #100 體型骨架成貓／幼貓卡片各佔 1/2、大圓角；移除貓咪上架／下架（`PublishPanel`、`POST /api/hq/cat-models/<id>/publish`、`setPublication`、`sbPublish`、`canPublish`），資料庫與既有上架狀態未動；後台規格書新增 §2.4 版面原則 | （見 PR） |
| 2026-11-01 | Tina × Claude Code | #102 貓咪模型列表：移除狀態欄與狀態篩選、移除操作欄（整列點擊進貓咪頁），新增建立者、備註說明，更新時間顯示到時分；舊資料的 published／unpublished 一律顯示為已完成（`normalizeStatus`），貓咪頁標題旁的狀態標籤移除；示範貓建立者「系統」、備註「系統預設範例」 | （見 PR） |
| 2026-11-01 | Tina × Claude Code | #105 新增貓咪頁：1 照片｜2 基本資料各佔一半（§2.4）；正面、背部花紋改為選填上傳（Storage `<id>/photo_front.*`、`photo_back.*`，路徑記在 `profile.extra_photos`，上色仍只用側面照）；移除「將使用哪個骨架」提示（體型改可切換，#104） | （見 PR） |
| 2026-11-02 | Tina × Claude Code | #110 AI 三視角照片第一階段：新增貓咪後自動以 Azure 影像模型（`AZURE_OPENAI_IMAGE_DEPLOYMENT`＝gpt-image-2）產生左側面／正面／背部（`src/lib/ai/image.ts`、`src/lib/prompts/cat-views.ts`、`ai-views.ts`、`POST /<id>/views` 以 `after()` 背景執行）；「貼圖工作頁」改名「製作glb工作區」並顯示原始＋三張、可單張重新產生；有 AI 左側面照時產生 glb 改用它（換 `photo_path`、原始另存、清去背快取） | （見 PR） |
| 2026-11-02 | Tina × Claude Code | #116 瀏覽器標題改「MeoWho｜喵戶總部」；登入頁依 Stitch（meowho）改左品牌區（圖示、標語「讓每隻貓都找到／好的人類」）｜右「進入總部」卡片（字標、整列 Google 登入）；手機只留品牌列＋卡片；不放不存在的政策連結 | （見 PR） |
| 2026-11-02 | Tina × Claude Code | #113 後台左側選單依 Stitch 改成分組（首頁｜營運與社群｜商品與知識｜虛擬與科技體驗｜系統）＋線條圖示＋目前頁面左側色條；保留原有項目與權限過濾，沒有項目的分組不顯示；頂列不改（`HqShell.tsx` 的 `NAV_GROUPS`、`NAV_ICONS`）。虛擬體驗元件管理改為分組標題，區塊為左側第一層（線條圖示，不用 emoji）：貓咪製作、室內空間、飼料、生活用品、其他；室內空間頁用大卡片進入寶麗來轉換、平面圖轉換（`hrefs.ts` 的 `ASSET_SECTIONS`，`?tab=`；除貓咪製作外皆規劃中）；頁面移除分頁 | （見 PR） |
| 2026-11-02 | Tina × Claude Code | #118 還沒有 3D 的貓：列表點進去直接到製作glb工作區，直接開貓咪頁也自動轉過去（不載入骨架示範貓），工作區返回連結改回列表；列表「動作數 3/9」（骨架共用動作數）改成「進度」欄（1/3 上傳照片 → 2/3 AI 三視角・產生中／完成 → 3/3 產生 3D・產生中／失敗 → 完成，`catProgress`）；播放／動作面板只在有貼圖時顯示，資訊區顯示其他角度照片；AI 三視角分「上傳的照片」（原始、其他角度 2、3）與「AI 三視角」兩區 | （見 PR） |
| 2026-11-02 | Tina × Claude Code | #110 新增貓咪頁依 Stitch「MeowHQ Cat Model Builder」改兩步驟（01 上傳原始照片＋其他角度 2、3＋基本資料＋進階畫質 → 「產生 AI 三視角」；02 年齡判斷（AI 看照片，判斷不出用表單年齡；幼貓自動加幼貓指示）、原始＋三張卡片、每張指示中｜EN、用量與費用；底部「確認並前往製作glb工作區」）；只保留 gpt-image-2（`AZURE_OPENAI_IMAGE_DEPLOYMENT`），聊天部署統一 `AZURE_OPENAI_CHAT_DEPLOYMENT_NAME`（gpt-6-luna，相容舊名）；Azure v1 端點；兩隻體型骨架移到 `/MeowHQ/assets/bases`（貓咪 tab「體型骨架預覽」按鈕）；#107 補傳介面不做（已關閉） | （見 PR） |
| 2026-11-03 | 珮瑜 × Claude Code | #93 影片轉換新增「已建立的房間」列表（同貓咪列表欄位、搜尋、分頁）與任務進度（6 步 `FlowStepper`、已經過分鐘數、排隊逾時提醒、完成耗時）；上傳可填備註（`meta.note`），worker 產生縮圖（`meta.thumb`）（`RoomVideoTab.tsx`、`RoomProgress.tsx`、`rooms/types.ts` 的 `roomStage`、`roomProgress`） | （見 PR） |
| 2026-11-01 | Tina × Claude Code | #107 貓咪頁「資訊」區可補傳／換一張正面、背部花紋照（`ExtraPhotos`、`POST /api/hq/cat-models/<id>/photos`、`/file/photo_front`、`/file/photo_back`）；Supabase 簽名上傳允許覆蓋；不寫稽核（動作清單需改 SQL） | （見 PR） |
| 2026-11-03 | Tina × Claude Code | #138 平面圖轉換 PR 3（AI 讀圖）：上傳確認後自動讀圖（`after()` 背景，Azure 聊天部署固定，`readFloorplanRoom`）；`POST /api/hq/rooms/floorplan/read` 重新讀圖（202，`maxDuration=120`）；輸出 `floorplanRoomSchema`（`src/lib/ai/schemas.ts`）、提示詞 `src/lib/prompts/floorplan.ts`；`src/lib/hq/floorplans/read.ts` 整理成 meta 格式並檢查（牆 ≥3 且封閉、單邊 1–20 m、門窗截到牆長、家具在房內、可跳上家具標 `walkable`）；房名是預設「房間 N」時才用 AI 讀到的；讀圖中超過 3 分鐘可重讀；戶 `status` 依房間更新（running／ready／failed）；`ai_raw` 不送畫面；測試用固定 JSON `fixtures/living-room.json`。無新 migration | （見 PR） |
| 2026-11-03 | Tina × Claude Code | #144 平面圖轉換支援室內實景照片：同一個上傳 AI 自動分辨平面圖／實景照片（`floorplanRoomSchema.kind`），一間房 1～4 張（`photo_paths`、`MAX_ROOM_IMAGES`），讀圖時多張一起送（`ChainInput.moreImageDataUrls`）；格局記 `input`，照片比例一律推估；新增 `POST|DELETE /api/hq/floorplans/<戶>/rooms/<房間>/photos`（加照片後自動重讀）；實景照片保留原圖，決策 007 補充第二個例外。無新 migration | （見 PR） |
| 2026-11-03 | Tina × Claude Code | #138 步驟 4 3D 娃娃屋：`src/lib/hq/floorplans/scene.ts`（純函式：牆扣門窗成實心段＋門楣／窗台／玻璃、兩端延伸半牆厚補轉角、家具方塊、讀圖完成的房間並排間距 1 m、`colliders()` 碰撞體清單）；`FloorplanViewer.tsx`（@react-three/fiber，無天花板、可轉、點地板或上方房名選房間），一戶工作頁上方新增「3D 檢視」區。Rapier 物理留到步驟 5 放貓 | （見 PR） |
| 2026-11-03 | Tina × Claude Code | #138 3D 外觀與家具位置：Tina 要 `Meow/meowho_3d_room` 的效果 → 家具模型庫 `scripts/blender/furniture_kit.py`（沿用該專案材質與建模，12 種家具各一個 glb，約 800 KB，`public/hq-floorplan/`）、`kit.ts` 縮放；`FloorplanViewer` 改用模型、橡木地板、柔光陰影、面向鏡頭的牆自動降低、鏡頭依外框取景；AI 輸出加 `layoutNotes`（先描述每面牆）與家具 `wall`（背面靠哪面牆），`snapToWall` 貼齊牆面並轉向；牆被丟掉時門窗與家具的牆索引跟著換 | （見 PR） |
| 2026-11-03 | Tina × Claude Code | #138 修正：3D 上方房名膠囊切換沒有作用（只換下方預覽）→ 加「全部」，點某間時 3D 只顯示那一間並重新取景（`scene.ts` 的 `focusScenes`、`FloorplanViewer` 的 `CameraRig`）；下方房間清單切換時，單間模式跟著換 | （見 PR） |
| 2026-11-03 | Tina × Claude Code | #150 虛擬體驗：虛擬體驗元件管理加第一層「虛擬體驗」（`?tab=experience&cat=&house=`），選虛擬貓（只列有確認貼圖的，`catLook.ts`，貓咪頁共用 `defaultBody`）＋選喵戶（只列有讀圖完成房間的），貓放進 `FloorplanViewer`（新 `cat` 屬性；`CatPreview` 匯出 `CatModel` 重用）；點地板貓走過去、被牆與家具擋住並沿邊滑過去、閒置自己逛（`catwalk.ts` 純函式） | （見 PR） |
| 2026-11-03 | Tina × Claude Code | 貓咪頁左欄加「AI 三視角」「貓咪紋理」（可收合）；列表加刪除（`DELETE /api/hq/cat-models/<id>`，排隊／生成中不能刪，示範貓不能刪，Supabase 一併刪照片與貼圖檔並寫稽核） | #154 |
| 2026-11-03 | Tina × Claude Code | #150 虛擬體驗二：Tina 覺得貓太小 → 貓放大 1.2 倍（`CAT_SCALE`）、鏡頭靠近並跟著貓（`FollowCat`）、起點固定在離房間中心最近的空位；點床、沙發坐墊、桌子等檯面跳上去、在上面走、點地板跳下來（`catjump.ts`，弧線跳躍先播 walk）；閒置在床或沙發上睡覺；娃娃屋剖面改以房間中心判斷鏡頭在哪側；`catwalk.ts` 抽出 `stepToward`（地板與檯面共用） | （見 PR） |
| 2026-11-03 | Tina × Claude Code | #150 修正：貓在床上腳被擋住（陷進枕頭）→ 床的檯面只算棉被那一段（`catjump.ts` 的 `surfaces`，枕頭 0.58 m 比棉被 0.5 m 高）；貓整體抬高 1 公分 | （見 PR） |
| 2026-11-03 | Tina × Claude Code | #154 修正列表沒有刪除按鈕：MeowHQ 新增的貓 `owner_type` 也是 template，改用 `builtin`（只有內建示範貓）判斷不能刪 | #154 |
| 2026-11-03 | Tina × Claude Code | #154 排隊或生成中的貓也能刪除（Tina 決定）；已在跑的 worker 寫回時可能留下 Storage 孤兒檔 | #154 |
| 2026-11-03 | Tina × Claude Code | #159 貓咪模型列表改版：欄位改為貓咪模型（縮圖＋名稱＋示範貓標籤）、進度（狀態＋n/4＋4 段進度條＋目前步驟）、備註說明（最多 2 行，空白顯示「尚未填寫」）、建立者／更新、操作；依進度篩選（全部／產生中／完成／示範貓，網址 `status=running|done|demo`，分組邏輯 `catListGroup`）；搜尋也比對建立者；刪除確認說明 3D 模型與貼圖一併刪除、無法復原，排隊或生成中時另註明任務一併取消；示範貓操作欄顯示「不可刪除」 | （見 PR） |
| 2026-11-04 | Tina × Claude Code | #169 紋理貼圖 worker 放進 repo `workers/cat-paint/`（含 Azure VM 安裝腳本、systemd），預定跑在 Azure VM（T4） | #169 |
| 2026-11-05 | Tina × Cursor | #218 KPI Dashboard：`/MeowHQ` 營運總覽、`GET /api/hq/dashboard`、`docs/hq/06_kpi-dashboard.md`、`0023_meow_dashboard_stats.sql`（待執行） | #218 |
| 2026-11-06 | Tina × Codex | #258 貓咪製作頁：流程圖改為可收合，操作按鈕移到流程外；貓咪模型列表拆出年齡、3D 成貓、3D 幼貓欄位，並更新欄位文案 | #258 |
| 2026-11-09 | Tina × Claude Code | #297 虛擬體驗故事線：上方「故事線」選單（`?story=`），「貓咪的吃喝拉撒」依序肚子餓、口渴、想上廁所，貓頭上冒線條圖示對話框，放上餐碗組／水碗或飲水機／貓砂盆後自己走過去做（`story.ts`、`FloorplanViewer` 的 `story`）；成貓、幼貓母體新增 eat、drink、toilet（`Meow/needs_clips.py`，副本 `scripts/blender/needs_clips.py`）；**Storage 母體待上傳** | #297 |
| 2026-11-09 | Tina × Claude Code | #302 `/MeowHQ/assets/bases` 改成「3D 貓咪體型預覽」大貓｜成貓｜幼貓三分頁（`?body=`），每頁是骨架測試台＋「貓咪資訊」；新增大貓母體 `public/hq-cat-models/base/base_clips_large.glb`（CC-BY 4.0，只做預覽、未進 BodyType）與參考照片；舊 `/bases/<body>` 轉址；測試台版面改 7:3 | （見 PR） |
| 2026-11-09 | Tina × Claude Code | #304 故事線：餐碗組辨識飼料碗與水碗（`bowlSlotsDetect.ts` 讀模型顏色、`bowl-slots.ts` 判斷），吃飯站飼料碗前、喝水站水碗前（餐碗組也算喝水用品），貓站在碗中心往外 `NOSE_REACH_M`，碗不當障礙；母體補齊撒嬌（cuddle）、休息（rest）、理毛（groom），動作庫已無規劃中動作；**Storage 母體待上傳** | #304 |
| 2026-11-09 | Tina × Claude Code | #318 故事線：貓不再穿越碗盆——碗有碰撞（餐碗組＝兩個碗、碗墊可踩），站位＝碗半徑＋前腳掌前伸距離（腳掌踩碗外），最後靠近才拿掉這組碗的碰撞；做動作時貼齊站位。母體 eat／drink 改成往前伸脖子、前半身壓低，鼻尖在前腳掌前約 4–5 cm | #318 |
| 2026-11-10 | Tina × Claude Code | #331 體型預覽新增第 4 分頁「奔跑貓」：`public/hq-cat-models/base/cat_runner_tabby.glb`（低多邊形、重新展 UV＋程序化橘白虎斑、動作 run）；動作庫新增「奔跑」（CLIP_LIBRARY_VERSION 8） | （見 PR） |
| 2026-11-11 | Tina × Claude Code | #365 成貓母體脊椎＋尾巴拉直、加鬍鬚（`whiskers`，嘴邊 2×12、眉毛鬚 2×3，掛 `head0`），`base_clips.glb` 重新匯出並以 `eat_drink.mjs adult` 重做 eat／drink；`step3b_fill.py` 補紋改自然鯖魚虎斑、頭部不補；新增 `workers/cat-paint/cat_studio/project_views.py`（三視角投影烘焙）；新增「3D 貓咪母體模型位置」一節；**Storage 母體待上傳** | （見 PR） |
| 2026-11-11 | Tina × Claude Code | #367 示範貓「第一隻虎斑貓」成貓貼圖換成三視角投影版，加上 AI 三視角與兩張實拍參考照（`public/hq-cat-models/cats/cat_20261030_140731/`、`bundled.ts` 的 `bundledFilePublicPath` 支援 `gen_*`、`photo_front／back`） | （見 PR） |
| 2026-11-11 | Tina × Claude Code | #369 `/MeowHQ/assets/bases?body=adult` 預覽貓套用第一隻虎斑貓的成貓紋理（`bases.ts` 的 `previewAlbedoUrl`；其他分頁仍用母體內建毛色） | （見 PR） |
| 2026-11-11 | Tina × Claude Code | #369 體型預覽成貓分頁左上角標籤改成「第一隻虎斑貓」（`previewBadge`），其他分頁仍是「示範毛色」 | （見 PR） |
| 2026-11-11 | Tina × Claude Code | #365 追加：鬍鬚位置修正——原本用兩眼距當尺（此母體 6.7 cm 偏寬）掉到下巴；改用固定公分，鬍鬚墊在鼻頭下 0.8～1.5 cm、往後 1～2.2 cm、往外 1～1.9 cm，接近水平；眉毛鬚改在眼睛正上方約 1.3 cm。動作與 main 逐格相同，只換 `whiskers` 網格；**Storage 母體待重新上傳** | （見 PR） |
| 2026-11-11 | Tina × Claude Code | #365 追加 2：鬍鬚根部再往上移到鼻子兩旁、嘴線之上（鼻頭下 0.1～0.6 cm、往後 0.6～1.7 cm、往外 0.9～1.7 cm），下垂與俯角減少；動作與 main 逐格相同；**Storage 母體待重新上傳** | （見 PR） |
- 2026-10-29｜#24：前端呼叫 `meow_suspend_user`／`meow_unsuspend_user`／`meow_ban_email`／`meow_unban_email`／`meow_review_verification`／`meow_revoke_badge`；「要求補件」不另設狀態，用退回＋快選原因「退回並要求補件」；黑名單狀態只有系統管理員讀得到（RLS），其他管理員看不到黑名單欄與操作。

- 2026-10-31｜#75：虛擬體驗元件分四個區塊（貓咪、室內空間、生活用品、其他），R3 已改寫；貓咪模型的貼圖由 cat_studio/paint_worker.py 產生，網頁只建任務與預覽（共用母體 ase_clips.glb 換 cat_fur 貼圖，不需每隻貓各一個 glb）；動作屬母體，補入新動作後所有貓自動擁有；本機模式（可新增／產生）只在非 production 且設了 CAT_STUDIO_ROOT 時啟用；正式站改讀 `public/hq-cat-models/` 示範貓（已完成的 bb）供預覽，寫入仍關閉。004_meow_cat_models.sql（資料表 meow_cat_models、meow_cat_model_jobs、bucket meow-cat-photos／meow-cat-models）在 PR 3，執行前須經 Tina 確認。
- 2026-11-01｜#88：照片不經 API 轉送，改由瀏覽器拿簽好的網址直傳 `meow-cat-model-photos`（Vercel 請求上限約 4.5 MB，照片上限 10 MB）。寫入一律用登入者 session（RLS 檢查 `virtual_assets`），不用 service role。預覽用哪個母體看 `base_version`（貼圖只能套回畫它的母體，兩個母體 UV 不同）：`kitten*`＝幼貓、其他有貼圖＝成貓（含舊資料 `v1`）、沒有貼圖才依年齡（≤6 個月幼貓）。重新產生成功後狀態回到「已完成」，已上架的貓要重新上架。
- 2026-11-01｜#88：後台畫面不用「母體」一詞，改說「體型骨架」（程式、資料、文件仍叫母體）；骨架由年齡自動決定，畫面不做成「選一個」的樣子，避免誤會。
- 2026-11-02｜#120：新增貓咪頁移除成貓／幼貓樣品照；主照片、其他角度 2、3 桌面三欄／手機響應式；新增性別公／母並持久化到本機與 Supabase profile。
- 2026-11-02｜#123：製作 GLB 工作區桌面左右固定雙欄；左側「虛擬貓咪檔案」包含 profile、上傳照片、AI 三視角、畫質／費用與貼圖，右側包含產生選項與任務進度；手機上下排列並可收合左側；新增貓咪名稱與性別桌面同列、窄螢幕上下排列。既有生成、重試與持久化行為不變。

### #104 成貓／幼貓變體（2026-11-02）
- 資料表：`meow_cat_model_variants`，以 `(model_id, body_type)` 區分目前版、上一版、母體版本及確認貼圖；任務新增 `body_type`。Migration：`0016_meow_cat_model_variants.sql`，已於 2026-11-04 在 `onebpkbkrnnwamwsoelo` 確認存在（variants 表、`body_type`、RLS）。
- API：`paint`、`confirm`、`restore` 依指定體型操作；貓咪頁只顯示該體型已確認貼圖。舊資料按各貼圖的 `base_version` 分流，舊 `v1` 視為成貓。
- Worker：Tina 本機 `paint_worker.py` 已按 `docs/hq/paint-worker-104.patch` 修改；重啟 worker 並套用 SQL 後，才設 `CAT_MODEL_VARIANTS_WORKER_READY=1`。未設時沿用舊流程。
- 驗證：雙體型獨立資料與本機／Supabase 契約測試；尚未在正式 Supabase 執行 migration 或完成線上生成。

### #197 生活用品（2026-11-04）
- Migration：`0021_meow_household_items.sql`，已於 2026-11-04 在 `onebpkbkrnnwamwsoelo` 執行。新增 `meow_item_categories`、`meow_items`、公開 bucket `meow-items`（只允許 .glb，20MB）；讀取公開，寫入需 `virtual_assets`。畫面與虛擬體驗接線尚未做。
- 畫面：`ItemsTab`（上傳、篩選、類別 CRUD）；虛擬體驗 `ExperienceTab` 可放置用品，`FloorplanViewer` 加入碰撞。
- 小物分流：平面圖 AI 讀落地風扇（`fan`）、桌上電腦（`computer`）與桌上雜物（`cup`／`vase`／`notebook`，可 `parent` 貼 desk／table／cabinet／counter）；**包包、鍵盤**仍走生活用品上傳（`0022` 種子含 `bags`／`keyboards`／`cups`／`vases`／`notebooks`，後三者亦可手動上傳自訂 glb）。虛擬體驗 nested：`PlacedHouseholdItem.y`／`support`。
