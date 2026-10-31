# HANDOFF — 接手的 agent 需要知道的事

> 寫給「完全沒有上下文的下一個 agent」。只保留**現在仍然成立**的內容。
> 最後更新：2026-10-31｜子哲 × Claude Code（#57 範圍定案）

## 目前狀態
- `main` 上的首頁、頁首頁尾是 **meowwho-v2 新版 UI**（#65）；首頁「帶我回家」等區塊資料仍為示意（`src/lib/cats.ts`、`households.ts`）。尚未改版的內頁沿用舊元件樣式。
- 已接 Supabase（Auth、Postgres、Storage）與 AI（LangChain，`src/lib/ai/`，可切換 Gemini／OpenAI／Azure／Anthropic）的程式碼；**環境變數尚未設定時網站為「示範模式」**：可操作但不能登入、不儲存、AI 改用規則解析。設定步驟：`docs/setup/SUPABASE_LLM_SETUP.md`。
- 已完成：中途之家 onboarding（`/onboarding`）、我的貓戶（`/me`）、條款頁（`/legal`）。其他 `data-proto` 按鈕仍只跳提示。
- 一句話配對是**前端關鍵字規則**（`src/lib/match.ts`），是 RAG 的佔位；保留輸入輸出形狀，之後換實作。
- 正在進行的分支：`feat/33-onboarding-walkthrough`（Issue #33，待建立 PR）。
- 後台權限已改為「系統管理員按模組授權」（`docs/decisions/003-module-based-admin-authorization.md`，SRS v1.1 M15）；程式尚未跟上，現在任何 admin 都能授權他人（PLAN 任務 23）。名詞定義見根目錄 `GLOSSARY.md`。
- 後台：**MeowHQ `/MeowHQ`**（舊隱藏後台 `/mh-console-8k2p` 已移除，Tina 2026-10-29 決定）；第一位系統管理員需用 SQL 指定，見 `docs/setup/SUPABASE_LLM_SETUP.md` §7。
- 已部署：Vercel 專案 `zing15s-projects/meowho`（Hobby，帳號 ZING15），正式網址 https://meowho.vercel.app ，連動 `main` 自動部署，每個 PR 有預覽網址。`main` 須由 ZING15 以「Create a merge commit」合併，否則 Hobby 會擋部署。舊網址 meowhome.hsiangsolutions.com（Tina 的 `meow-home`）已不再更新。決策 005。

- **MeowHQ 後台開發中**（規格 `docs/hq/01～03`）：階段 0（T-HQ-01，Issue #18，分支 `feat/18-hq-contract`）已完成、PR 待 Tina 審查。內容：`src/lib/hq/types.ts`（模組代號、角色、處置類型、快選原因、錯誤代碼、側欄順序）＋測試，以及 `docs/modules/admin-moderation.md` 的 `0002_meow_hq.sql` 資料表草案。**`0002_meow_hq.sql` 檔案尚未建立、也沒有執行任何 SQL**（階段 1 的 db Issue 才寫檔）。**#18 合併前不要開始階段 1**；T-HQ-11 等 Issue #15（儲存位置）。待 Tina 決定的問題在 `PLAN.md`「建議」區的 MeowHQ 項目。

- **`0002_meow_hq.sql` 已在 Supabase 執行（2026-10-29）**：Tina 為 `system_admin`。SQL 測試已納入 `npm test`（PGlite）。
- **MeowHQ 階段 2**：#22 待辦總覽與列表元件已完成（`src/lib/hq/todos.ts`、`listing.ts`、`audit.ts`、`src/components/hq/list/`、`HqActor.tsx` 的 `useHqActor`／`HqModuleGuard`）；#23 Admin 授權、#24 用戶權限管理由 Claude 進行中。各模組頁用 `HqModuleGuard` 包住、`HqPageHeader` 做頁首、`useListQuery` 把篩選寫進網址。尚未開發的模組（檢舉、商品、知識、虛擬元件）顯示「模組開發中」。

- **#20（logic）已實作待審**（分支 `feat/20-hq-logic`）：`src/lib/hq/permissions.ts`、`actions.ts` 純函式；#21 shell、#22～#24 直接 import 使用，不要重複寫判斷。時間相關函式由呼叫端傳入 `now`。

- **LLM 輸入防護（#38，決策 004）**：新增任何 LLM 任務，使用者內容必須經 `wrapUserInput()`、API 必須用 `checkInput()`（`src/lib/ai/guard.ts`）。問答模組上線時要實作「每段 20 輪、每天 50 次」。
- **`0003_meow_site_assets.sql` 已在 Supabase 執行（2026-10-29，`meow_0003_site_assets`）**：Logo 上傳與網站設定可用，待 Tina 登入實測。

- **首頁改用 meowwho-v2 新版 UI**（Issue #64，分支 `feat/64-meowho-v2-ui`，2026-10-31 子哲 × Claude）：新元件在 `src/components/{home,journey,layout,ui}/`，只用 `globals.css` 的 v2 token（`--paper`、`--ink`、`--caramel`…）；舊 token（`--cocoa`、`--peach`…）在 `template.css` 對應到 v2，留給尚未改版的內頁與後台。按鈕用 `CatButton`，不要在新元件用 `.btn`。

- **#57 喵戶與貓咪 profile 範圍已定案（2026-10-31）**：完整範圍寫在 Issue #57 內文；名詞見 `GLOSSARY.md`（喵戶、年齡層四級、個性標籤、健康標籤、背景標記）。架構見決策 006（Azure Blob＋GPU、可轉移規則）、居家影像規則見決策 007。私訊另開 #70。難度參數暫緩。

## 下一步（建議第一個動作）
0. Issue #33：程式與四項檢查已完成，待建立 PR；正式站 `/onboarding` 停在「載入中…」，未完成登入後實際流程，PR 需保留此限制。
1. #18 合併後，平行開工階段 1：#19（db）、#20（logic）、#21（shell）；階段 2 為 #22（lists-home）、#23（admin-auth）、#24（users），等階段 1 合併後開始。Issue 都已建立，不用再建。
2. 正式環境已設定完成（2026-10-30，`docs/setup/SUPABASE_LLM_SETUP.md`）：Supabase、Google 登入、Gemini、Vercel 環境變數。新專案的第一位系統管理員由子哲用 SQL 指定（§7）。
3. 下一個任務建議：貓咪公開頁、首頁「帶我回家」改讀真實資料（任務 3）、領養人 onboarding（任務 7）。
3. PLAN.md 其餘任務的 Issue 尚未建立。

## 地雷與注意
- **照片**：來自 Google Stitch 設計稿的外部網址（`src/lib/photo-urls.json`），可能失效。展示前執行 `npm run photos:download`，並設 `NEXT_PUBLIC_LOCAL_PHOTOS=1`。雲端 agent 的環境可能連不到這些網址，截圖驗證時看到空白屬正常。
- **字型**：從 Google Fonts 以 `<link>` 載入（Quicksand、Zen Maru Gothic、Noto Sans TC）；離線時退回系統字。
- **管理者標誌設定**：目前存 localStorage；任務 17 會改存資料庫，不要更換 `public/logos/` 的檔案。
- **Vercel Hobby＋private repo**：非帳號擁有者的 commit 會被擋下部署（見 CONTRIBUTING §8）。
- **GitHub Free private repo**：branch protection 不會強制生效，main 只能靠流程自律。
- `npm install` 若遇到 peer 相依錯誤，測試套件版本已固定在 vitest@3、@vitejs/plugin-react@4，不要升級到最新主版本。

- **Supabase 是獨立專案 `onebpkbkrnnwamwsoelo`**（2026-10-30 起，決策 005；舊共用專案 `pnnehddxeujxghhnnqrv` 不再使用）：資料表、函式、policy 仍一律 `meow_` 開頭，bucket `meow-cat-photos`。**不要動非 `meow_` 開頭的物件、不要在 `auth.users` 加 trigger；Site URL 固定 `https://meowho.vercel.app`**。完整規範：`AGENTS.md` §7。
- **Supabase migration** 由 AI 透過 Supabase 連接器執行，執行前須經發起人確認（AGENTS.md §7.4）；新專案已執行 `0001`～`0003`。
- **Google 登入**：Supabase Site URL＝`https://meowho.vercel.app`，Redirect URLs 含 `https://meowho.vercel.app/**`、`https://*-zing15s-projects.vercel.app/**`、`http://localhost:3000/**`；Google OAuth 在「測試中」，新組員要先加進 Google Cloud `meowho` 的測試使用者。

- **MeowHQ shell（#21）**：外殼在 `src/app/MeowHQ/`＋`src/components/hq/`。舊後台已移除（功能移到 #23 管理員授權與網站外觀、#24 中途認證）。`src/components/hq/access.ts` 的 `visibleSidebar` 讀不到授權表時會退回「全部可見」，0002 執行後由 #22 改接 `permissions.ts` 並移除退回邏輯。`Auth.tsx` 的 `isAdmin` 為 admin 或 system_admin（`src/lib/auth-role.ts`）。本機未設 Supabase 時用 `/MeowHQ?hqPreview=1` 預覽外殼（僅非 production）。

## 重要檔案
| 檔案 | 用途 |
|---|---|
| `AGENTS.md` | 共同規範 |
| `docs/agents/PLAN.md` | 任務與排程 |
| `docs/modules/*.md` | 各大模組現況 |
| `docs/daily/` | 每日紀錄 |
| `docs/spec/01_系統需求規格書_SRS.md` | 需求 |
| `docs/design/DESIGN.md` | 設計系統 |

- **#23 Admin 授權（2026-10-29，Claude）**：`/MeowHQ/admin` 已完成，分支 `feat/23-hq-admin-auth`。`0003_meow_site_assets.sql` **尚未在 Supabase 執行**，執行前上傳 Logo、儲存網站設定會失敗。Logo 寫入只能走 `meow_set_site_setting`，前端用 `useUi().applyLogo` 立即套用。

- **#24 用戶權限管理（審查中，分支 `feat/24-hq-users`）**：`/MeowHQ/users` 帳號＋中途認證兩分頁；資料庫函式呼叫統一走 `src/components/hq/users/useHqRpc.ts`（成功 toast 帶「查看紀錄」、`permission_denied` 回待辦總覽）。其他模組可重用。
