# HANDOFF — 接手的 agent 需要知道的事

> 寫給「完全沒有上下文的下一個 agent」。只保留**現在仍然成立**的內容。
> 最後更新：2026-10-29 00:10｜Tina × Cursor

## 目前狀態
- `main` 上是**首頁原型**：Next.js 15＋Cozy Cat Nook 設計，資料全部來自 `src/lib/mock-data.ts`（示意）。
- 已接 Supabase（Auth、Postgres、Storage）與 AI（LangChain，`src/lib/ai/`，可切換 Gemini／OpenAI／Azure／Anthropic）的程式碼；**環境變數尚未設定時網站為「示範模式」**：可操作但不能登入、不儲存、AI 改用規則解析。設定步驟：`docs/setup/SUPABASE_LLM_SETUP.md`。
- 已完成：中途之家 onboarding（`/onboarding`）、我的貓戶（`/me`）、條款頁（`/legal`）。其他 `data-proto` 按鈕仍只跳提示。
- 一句話配對是**前端關鍵字規則**（`src/lib/match.ts`），是 RAG 的佔位；保留輸入輸出形狀，之後換實作。
- 正在進行的分支：`feat/1-household-onboarding`（PR 待合併，含 Issue #1、#3）。
- 後台權限已改為「系統管理員按模組授權」（`docs/decisions/003-module-based-admin-authorization.md`，SRS v1.1 M15）；程式尚未跟上，現在任何 admin 都能授權他人（PLAN 任務 23）。名詞定義見根目錄 `GLOSSARY.md`。
- 隱藏管理後台：`/mh-console-8k2p`（不出現在介面上）；第一位管理員需用 SQL 指定，見 `docs/setup/SUPABASE_LLM_SETUP.md` §7。
- 已部署：Vercel 專案 `meow-home`（Hobby，帳號 somebabyTina），正式網址 https://meowhome.hsiangsolutions.com （網域在 Porkbun，CNAME 指向 Vercel），連動 `main` 自動部署。

- **MeowHQ 後台開發中**（規格 `docs/hq/01～03`）：階段 0（T-HQ-01，Issue #18，分支 `feat/18-hq-contract`）已完成、PR 待 Tina 審查。內容：`src/lib/hq/types.ts`（模組代號、角色、處置類型、快選原因、錯誤代碼、側欄順序）＋測試，以及 `docs/modules/admin-moderation.md` 的 `0002_meow_hq.sql` 資料表草案。**`0002_meow_hq.sql` 檔案尚未建立、也沒有執行任何 SQL**（階段 1 的 db Issue 才寫檔）。**#18 合併前不要開始階段 1**；T-HQ-11 等 Issue #15（儲存位置）。待 Tina 決定的問題在 `PLAN.md`「建議」區的 MeowHQ 項目。

## 下一步（建議第一個動作）
0. 若 Tina 已確認並合併 #18：為階段 1（db／logic／shell）各建一張 Issue，再平行開工。
1. 資料庫已建好（`0001_meow.sql` 於 2026-10-28 執行）。剩下依 `docs/setup/SUPABASE_LLM_SETUP.md`：Google OAuth Redirect URL、LLM 金鑰、Vercel 環境變數，以及登入一次後指定第一位管理員。
2. 下一個任務建議：貓咪公開頁、首頁「帶我回家」改讀真實資料（任務 3）、領養人 onboarding（任務 7）。
3. PLAN.md 其餘任務的 Issue 尚未建立。

## 地雷與注意
- **照片**：來自 Google Stitch 設計稿的外部網址（`src/lib/photo-urls.json`），可能失效。展示前執行 `npm run photos:download`，並設 `NEXT_PUBLIC_LOCAL_PHOTOS=1`。雲端 agent 的環境可能連不到這些網址，截圖驗證時看到空白屬正常。
- **字型**：從 Google Fonts 以 `<link>` 載入（Quicksand、Zen Maru Gothic、Noto Sans TC）；離線時退回系統字。
- **管理者標誌設定**：目前存 localStorage；任務 17 會改存資料庫，不要更換 `public/logos/` 的檔案。
- **Vercel Hobby＋private repo**：非帳號擁有者的 commit 會被擋下部署（見 CONTRIBUTING §8）。
- **GitHub Free private repo**：branch protection 不會強制生效，main 只能靠流程自律。
- `npm install` 若遇到 peer 相依錯誤，測試套件版本已固定在 vitest@3、@vitejs/plugin-react@4，不要升級到最新主版本。

- **Supabase 是共用專案**（`pnnehddxeujxghhnnqrv`，免費方案限 2 個專案）：MeowHome 的資料表、函式、policy 一律 `meow_` 開頭，bucket `meow-cat-photos`。**不要動任何非 `meow_` 開頭的物件、不要在 `auth.users` 加 trigger、不要改 Site URL**。完整規範：`AGENTS.md` §7。
- **Supabase migration** 由 AI 透過 Supabase 連接器執行，執行前須經發起人確認（AGENTS.md §7.4）；`0001` 已執行。
- **Google 登入**：Supabase 的 Redirect URLs 要包含正式網域、Vercel 預覽網域與 localhost，否則登入後會被導回錯誤網址。

## 重要檔案
| 檔案 | 用途 |
|---|---|
| `AGENTS.md` | 共同規範 |
| `docs/agents/PLAN.md` | 任務與排程 |
| `docs/modules/*.md` | 各大模組現況 |
| `docs/daily/` | 每日紀錄 |
| `docs/spec/01_系統需求規格書_SRS.md` | 需求 |
| `docs/design/DESIGN.md` | 設計系統 |
