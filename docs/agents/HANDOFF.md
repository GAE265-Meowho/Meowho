# HANDOFF — 接手的 agent 需要知道的事

> 寫給「完全沒有上下文的下一個 agent」。只保留**現在仍然成立**的內容。
> 最後更新：2026-10-28｜Tina × Claude Code

## 目前狀態
- `main` 上是**首頁原型**：Next.js 15＋Cozy Cat Nook 設計，資料全部來自 `src/lib/mock-data.ts`（示意）。
- 尚未接任何後端：沒有 Supabase、沒有登入、沒有 LLM。標示 `data-login`／`data-proto` 的按鈕只會跳提示。
- 一句話配對是**前端關鍵字規則**（`src/lib/match.ts`），是 RAG 的佔位；保留輸入輸出形狀，之後換實作。
- 正在進行的分支：無。

## 下一步（建議第一個動作）
1. 任務 1：建立 Supabase 專案、Google 登入、條款同意（見 `docs/modules/account.md`）。
2. 任務完成前先在 GitHub 建立對應 Issue（PLAN.md 的 Issue 欄目前都是「待建立」）。

## 地雷與注意
- **照片**：來自 Google Stitch 設計稿的外部網址（`src/lib/photo-urls.json`），可能失效。展示前執行 `npm run photos:download`，並設 `NEXT_PUBLIC_LOCAL_PHOTOS=1`。雲端 agent 的環境可能連不到這些網址，截圖驗證時看到空白屬正常。
- **字型**：從 Google Fonts 以 `<link>` 載入（Quicksand、Zen Maru Gothic、Noto Sans TC）；離線時退回系統字。
- **管理者標誌設定**：目前存 localStorage；任務 17 會改存資料庫，不要更換 `public/logos/` 的檔案。
- **Vercel Hobby＋private repo**：非帳號擁有者的 commit 會被擋下部署（見 CONTRIBUTING §8）。
- **GitHub Free private repo**：branch protection 不會強制生效，main 只能靠流程自律。
- `npm install` 若遇到 peer 相依錯誤，測試套件版本已固定在 vitest@3、@vitejs/plugin-react@4，不要升級到最新主版本。

## 重要檔案
| 檔案 | 用途 |
|---|---|
| `AGENTS.md` | 共同規範 |
| `docs/agents/PLAN.md` | 任務與排程 |
| `docs/modules/*.md` | 各大模組現況 |
| `docs/daily/` | 每日紀錄 |
| `docs/spec/01_系統需求規格書_SRS.md` | 需求 |
| `docs/design/DESIGN.md` | 設計系統 |
