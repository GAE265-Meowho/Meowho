# 模組：AI 配對與首頁（matching）

> 最後更新：2026-10-28｜Tina × Claude Code
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
首頁原型完成；新增「你今天想做什麼？」入口（建立貓戶／我想領養）。配對為前端關鍵字規則（`match.ts`），已有 5 個單元測試。

## 資料表（Supabase）
- 讀取 `cats`、公開 `posts`、`weekly_reports` 的向量（pgvector）

## API／主要函式
- `parseQuery()`、`matchCats()`、`adoptList()`（`src/lib/match.ts`）
- 待建立：LLM 條件解析＋Embedding 混合檢索、推薦理由

## 主要檔案
- `src/app/page.tsx`、`src/components/Hero.tsx`、`src/components/Sections.tsx`、`src/lib/match.ts`、`src/lib/photos.ts`

## 決策
- 訪客預設同縣市、等最久優先；不要求 GPS。
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
