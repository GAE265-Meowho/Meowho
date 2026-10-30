# Meowho喵戶 🐾

> 讓每隻貓都找到好的家

愛貓社群與中途之家的貓貓追蹤管理與待領養人交流互動平台。
GAE265 AI 團體專案（6 人）｜皇家寵物食品專題合作｜用 AI 支持終養不棄養。

> 目前階段：首頁原型＋**中途之家 onboarding**（聊天建立貓戶與貓咪名片）。未設定 Supabase／LLM 環境變數時為示範模式，設定方式見 [docs/setup/SUPABASE_LLM_SETUP.md](docs/setup/SUPABASE_LLM_SETUP.md)。

## 快速開始

```bash
npm install
npm run dev        # http://localhost:3000
```

| 指令 | 用途 |
|---|---|
| `npm run dev` | 本機開發 |
| `npm run build` | 正式建置（PR 合併前必須通過） |
| `npm test` | 單元測試（Vitest） |
| `npm run typecheck` | TypeScript 型別檢查 |
| `npm run lint` | ESLint |
| `npm run photos:download` | 把設計稿照片下載到 `public/photos`（需可連外網） |

## 預覽方式

| 方式 | 適用 | 說明 |
|---|---|---|
| 本機 `npm run dev` | 開發者 | 最快 |
| **GitHub Codespaces** | 不想裝環境的組員 | Repo 頁面 → Code → Codespaces → Create。自動安裝並開啟 3000 埠預覽。個人帳號每月有免費額度 |
| **Vercel 正式網址** | 給老師、組外的人看 | https://meowho.vercel.app （`main` 有新 commit 會自動重新部署；部署限制見 [CONTRIBUTING.md](CONTRIBUTING.md#8-部署)） |

## 技術架構

Next.js 15（App Router、TypeScript）→ 之後加入 Supabase（Auth、Postgres、pgvector、Storage、Realtime）與 Python AI Worker。詳見 [`docs/spec/01_系統需求規格書_SRS.md`](docs/spec/01_系統需求規格書_SRS.md)。

## 文件

| 文件 | 內容 |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | **協同合作分工與方式規範**（每位組員必讀） |
| [CLAUDE.md](CLAUDE.md) | 給 AI 開發助理（Claude Code 等）的專案說明 |
| [docs/spec/](docs/spec/) | 需求規格書、開發任務、測試計畫、系統圖表 |
| [docs/design/DESIGN.md](docs/design/DESIGN.md) | Cozy Cat Nook 設計系統（色彩、字型、元件） |

## 照片來源

首頁照片取自團隊 Google Stitch 設計稿（AI 生成），網址列於 `src/lib/photo-urls.json`。正式展示前請執行 `npm run photos:download`，並在 `.env.local` 設定 `NEXT_PUBLIC_LOCAL_PHOTOS=1`，避免外部網址失效。
