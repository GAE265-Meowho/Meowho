# MeowHome — AI 開發助理說明

貓社群＋領養媒合平台（GAE265 團體專案）。手機優先的 Next.js 網站。回覆與文案使用繁體中文。

## 先讀
- 需求：`docs/spec/01_系統需求規格書_SRS.md`（需求編號 FR-模組-流水號、模組 M01–M17）
- 測試計畫：`docs/spec/03`～`05`（UT／MT／E2E 編號）
- 設計系統：`docs/design/DESIGN.md`（Cozy Cat Nook）
- 協作規範：`CONTRIBUTING.md`

## 指令
- `npm run dev`｜`npm test`｜`npm run typecheck`｜`npm run lint`｜`npm run build`
- 完成一張 Issue 前，四個檢查（test、typecheck、lint、build）都要通過。

## 結構
- `src/app/`：路由（App Router）
- `src/components/`：元件；`Providers.tsx` 提供 toast、站台標誌、管理者設定
- `src/lib/`：商業邏輯（純函式＋`*.test.ts`）、`mock-data.ts`（示意資料，之後換 Supabase）、`photos.ts`
- `src/lib/prompts/`：LLM 提示詞（之後建立）

## 規則
- 先寫失敗的測試再實作；邏輯放 `src/lib/` 便於測試。
- 只用 `globals.css` 的設計 token；按鈕用 `.btn`（`mint`／`pink`／`butter`／`ghost`、`sm`）。
- 原型中尚未完成的按鈕加 `data-login` 或 `data-proto="功能名"`，會自動顯示提示。
- 站台標誌由管理者設定選擇（`LOGOS`），不要更換 logo 檔案。
- 費用數字只來自資料庫或公式，LLM 不得產生數字；醫療相關內容附免責聲明；處方飼料只在有獸醫診斷紀錄時顯示。
- 位置只存縣市＋區；私密日記不可進入公開配對。
- 不要把金鑰寫進程式或 commit。

## 用語
貓戶（household）＝一位會員的貓咪之家｜貓戶長＝貓戶擁有者（飼主或中途）｜領養人＝想領養的會員｜虛擬試養＝綁定某隻待領養貓的 7 天模擬｜環境報告＝居家影片的 AI 風險報告｜週報＝AI 每週摘要
