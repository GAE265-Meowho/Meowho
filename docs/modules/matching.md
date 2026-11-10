# 模組：AI 配對與首頁（matching）

> 最後更新：2026-11-09｜子哲 × Claude Code
> 規則：本檔隨程式碼同一個 PR 更新；「決策」與「地雷」只增不刪（過時的標註［已失效］）。

## 目的
一句話搜尋（RAG）、帶我回家列表、首頁各區塊。

## 負責
主責：E、B｜支援：—

## 對應需求
- SRS：M07（FR-07-*）、M17（FR-17-*）
- 測試：UT-07-*、MT-07-*、E2E-02
- PLAN 任務：0、3、8

## 目前狀態
首頁已改為 meowwho-v2 新版 UI（2026-10-31）：Hero（一句話搜尋＋建立喵戶／新貓入戶入口）、核心價值、帶我回家（卡片／地圖）、領養三步驟、7 天虛擬飼養、時光小屋、貓咪諮詢站，3D 橘子隨捲動走到頁尾新家。元件在 `src/components/home/`，示意資料在 `src/lib/cats.ts`、`households.ts`、`home-photos.ts`。`match.ts` 的關鍵字配對仍保留（5 個單元測試），新首頁尚未接上。

## 資料表（Supabase）
- `meow_cat_embeddings`（0032，幫我找貓）：每隻貓一筆意思座標（`real[]`），只有伺服器讀寫；介紹文字雜湊不同或換模型才重算
- 搜尋時用登入者身分讀 `meow_cats`（待領養、公開）與自己的一般飼主 `meow_households`

## API／主要函式
- 幫我找貓（規格 `docs/spec/11_幫我找貓規格.md`）：`POST /api/find`（條件解析→合併喵戶→排除→依意思相近程度排序）、`POST /api/find/reasons`（前 6 名的 AI 推薦理由）；結果頁 `/find?q=&scope=city|all`
- 配對規則：`src/lib/find-cats.ts`（`mergeConditions`、`excludeReason`、`rankCats`、`catText`、`ruleReason`…）；AI：`src/lib/ai/find.ts`、提示詞 `src/lib/prompts/find.ts`、Embedding `getEmbeddings()`（`src/lib/ai/models.ts`）
- 舊的關鍵字規則 `parseQuery()`、`matchCats()`、`adoptList()`（`src/lib/match.ts`）：`parseQuery` 仍是 AI 沒回應時的備案

## 主要檔案
- `src/app/page.tsx`、`src/components/Hero.tsx`、`src/components/Sections.tsx`、`src/lib/match.ts`、`src/lib/photos.ts`
- 喵戶小區：`src/app/community/page.tsx`、`src/components/community/Town.tsx`、`src/lib/community.ts`（等角小鎮，每間房子＝一個貓戶；屋頂黃＝有貓等新家、粉＝剛重啟喵生（剛移轉到新家）、白＝一般貓戶；有「地區預覽」（新北板橋／新北中和／基隆）與貓戶預覽卡（住戶、日記照片影片數、相簿、最新隨筆）；第一版為示意資料，之後換 `meow_households`，只顯示縣市＋區）

## 決策
- 訪客預設同縣市、等最久優先；不要求 GPS。
- 2026-11-09 子哲：幫我找貓依「意思相近程度」排序（Embedding），條件只用來排除明顯不適合的貓；向量存 `real[]`、相似度在伺服器算，不用 pgvector（貓少，全部比一次就夠快）。
- 換成 RAG 時保留 `matchCats` 的輸入輸出形狀，讓畫面不用改。

## 待確認
—

## 地雷
- 照片為外部網址，可能失效（見 HANDOFF）。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
| 2026-10-28 | Tina × Claude Code | 首頁新增建立貓戶／領養意圖入口、導覽加「建立貓戶」 | #1 |
| 2026-10-28 | Tina × Claude Code | 入口置頂、新增「新貓入戶」、建立貓戶說明移出首頁 | #5 |
| 2026-10-29 | Tina × Claude Code | 新增「喵戶小區」`/community`（示意資料）、導覽加入口 | #44 |
| 2026-10-29 | Tina × Claude Code | 喵戶小區加「地區預覽」與貓戶預覽卡；粉屋頂改為「剛重啟喵生」 | #45 |
| 2026-11-09 | 子哲 × Claude Code | 幫我找貓：結果頁 `/find`、搜尋 API、意思座標 0032；首頁搜尋框接上 | （見 PR） |
| 2026-10-31 | 子哲 × Claude Code | 首頁、頁首頁尾改用 meowwho-v2 新版 UI（3D 橘子、帶我回家卡片／地圖、7 天虛擬飼養）；「你今天想做什麼？」入口併入 Hero | #64 |
