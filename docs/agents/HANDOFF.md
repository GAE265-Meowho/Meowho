# HANDOFF — 接手的 agent 需要知道的事

> 寫給「完全沒有上下文的下一個 agent」。只保留**現在仍然成立**的內容。
> 最後更新：2026-10-28 17:00｜Tina × Claude Code

## 目前狀態
- `main` 上是**首頁原型**：Next.js 15＋Cozy Cat Nook 設計，資料全部來自 `src/lib/mock-data.ts`（示意）。
- 已接 Supabase（Auth、Postgres、Storage）與 LLM（Gemini／OpenAI）的程式碼；**環境變數尚未設定時網站為「示範模式」**：可操作但不能登入、不儲存、AI 改用規則解析。設定步驟：`docs/setup/SUPABASE_LLM_SETUP.md`。
- 已完成：中途之家 onboarding（`/onboarding`）、我的貓戶（`/me`）、條款頁（`/legal`）。其他 `data-proto` 按鈕仍只跳提示。
- 一句話配對是**前端關鍵字規則**（`src/lib/match.ts`），是 RAG 的佔位；保留輸入輸出形狀，之後換實作。
- 正在進行的分支：`feat/1-household-onboarding`（PR 待合併，含 Issue #1、#3）。
- 隱藏管理後台：`/mh-console-8k2p`（不出現在介面上）；第一位管理員需用 SQL 指定，見 `docs/setup/SUPABASE_LLM_SETUP.md` §7。
- 已部署：Vercel 專案 `meow-home`（Hobby，帳號 somebabyTina），正式網址 https://meowhome.hsiangsolutions.com （網域在 Porkbun，CNAME 指向 Vercel），連動 `main` 自動部署。

## 下一步（建議第一個動作）
1. 組長依 `docs/setup/SUPABASE_LLM_SETUP.md` 建 Supabase、Google OAuth、LLM 金鑰並填入 Vercel，合併 PR #1 後實測。
2. 下一個任務建議：貓咪公開頁、首頁「帶我回家」改讀真實資料（任務 3）、領養人 onboarding（任務 7）。
3. PLAN.md 其餘任務的 Issue 尚未建立。

## 地雷與注意
- **照片**：來自 Google Stitch 設計稿的外部網址（`src/lib/photo-urls.json`），可能失效。展示前執行 `npm run photos:download`，並設 `NEXT_PUBLIC_LOCAL_PHOTOS=1`。雲端 agent 的環境可能連不到這些網址，截圖驗證時看到空白屬正常。
- **字型**：從 Google Fonts 以 `<link>` 載入（Quicksand、Zen Maru Gothic、Noto Sans TC）；離線時退回系統字。
- **管理者標誌設定**：目前存 localStorage；任務 17 會改存資料庫，不要更換 `public/logos/` 的檔案。
- **Vercel Hobby＋private repo**：非帳號擁有者的 commit 會被擋下部署（見 CONTRIBUTING §8）。
- **GitHub Free private repo**：branch protection 不會強制生效，main 只能靠流程自律。
- `npm install` 若遇到 peer 相依錯誤，測試套件版本已固定在 vitest@3、@vitejs/plugin-react@4，不要升級到最新主版本。

- **Supabase migration** 要在 SQL Editor 依序手動執行（`0001` → `0002`），目前沒有自動遷移。
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
