# 模組：AI 配對與首頁（matching）

> 最後更新：2026-11-09｜清俊 × Cursor
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
首頁已改為 meowwho-v2 新版 UI（2026-10-31）：Hero（一句話搜尋＋建立喵戶／新貓入戶入口）、核心價值、帶我回家（卡片／地圖）、領養三步驟、7 天虛擬飼養、時光小屋、貓咪諮詢站，3D 橘子隨捲動走到頁尾新家。元件在 `src/components/home/`，示意資料在 `src/lib/cats.ts`、`home-photos.ts`。`match.ts` 的關鍵字配對仍保留（5 個單元測試），新首頁尚未接上。

帶我回家的地圖（2026-11-09，清俊，預覽中、尚未開 PR）改成北／中／南／東＋離島的手繪台灣，貓用卡片同一批資料、只放到縣市＋行政區。邏輯在 `src/lib/adopt-map.ts`。舊的等角小鎮資料 `src/lib/households.ts` 畫面已不再引用。

## 資料表（Supabase）
- 讀取 `cats`、公開 `posts`、`weekly_reports` 的向量（pgvector）

## API／主要函式
- `parseQuery()`、`matchCats()`、`adoptList()`（`src/lib/match.ts`）
- 待建立：LLM 條件解析＋Embedding 混合檢索、推薦理由

## 主要檔案
- `src/app/page.tsx`、`src/components/home/adopt/`（卡片 `AdoptSection`、地圖 `AdoptMap`／`RegionCanvas`／`CatSprite`）、`src/lib/adopt-feed.ts`、`src/lib/adopt-map.ts`、`src/lib/match.ts`
- 喵戶小區：`src/app/community/page.tsx`、`src/components/community/Town.tsx`、`src/lib/community.ts`（等角小鎮，每間房子＝一個貓戶；屋頂黃＝有貓等新家、粉＝剛重啟喵生（剛移轉到新家）、白＝一般貓戶；有「地區預覽」（新北板橋／新北中和／基隆）與貓戶預覽卡（住戶、日記照片影片數、相簿、最新隨筆）；第一版為示意資料，之後換 `meow_households`，只顯示縣市＋區）

## 決策
- 訪客預設同縣市、等最久優先；不要求 GPS。
- 換成 RAG 時保留 `matchCats` 的輸入輸出形狀，讓畫面不用改。
- 2026-11-09（清俊）：帶我回家地圖只畫到縣市＋行政區；路名即使出現在字串裡也丟掉。澎湖、金門、連江獨立成「離島」，不併進東部。貓精靈的毛色讀 `coat`（示意貓用照片上的毛色），動作讀個性標籤：愛曬太陽、愛叫、活潑／愛玩、輕柔（以及既有的溫和、愛撒嬌、愛被抱、愛被梳毛）、愛踏踏／愛踩踏等，一隻貓只播一種。點地圖上的貓回到同一張卡片。
- 2026-11-09（清俊，預覽後）：縣市與鄉鎮市區用 taiwan-atlas 的內政部界線（`src/lib/geo/region-bounds.json`，`scripts/build-region-bounds.mjs` 可重產）。相鄰縣市換暖色，區界用淺色描邊；名稱是浮水印，畫在貓後面。

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
| 2026-10-31 | 子哲 × Claude Code | 首頁、頁首頁尾改用 meowwho-v2 新版 UI（3D 橘子、帶我回家卡片／地圖、7 天虛擬飼養）；「你今天想做什麼？」入口併入 Hero | #64 |
| 2026-11-09 | 清俊 × Cursor | 帶我回家地圖改為北中南東＋離島，貓標記對毛色與個性動作，點擊回到卡片。預覽分支，尚未開 PR | — |
