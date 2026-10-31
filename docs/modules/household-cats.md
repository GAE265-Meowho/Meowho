# 模組：貓戶、貓咪與時光小屋（household-cats）

> 最後更新：2026-10-28｜Tina × Claude Code
> 規則：本檔隨程式碼同一個 PR 更新；「決策」與「地雷」只增不刪（過時的標註［已失效］）。

## 目的
每位會員一個貓戶、多隻貓；貓咪資料、公開設定、獸醫診斷、領養設定；日記（＝貼文）、相簿、影片、時間軸。

## 負責
主責：B、C｜支援：E

## 對應需求
- SRS：M02（FR-02-*）、M04（FR-04-*）
- 測試：UT-02-*、UT-04-*、MT-02-*、MT-04-*
- PLAN 任務：2、4

## 目前狀態
貓戶與貓咪資料表、RLS、照片儲存已建立；可透過 `/onboarding` 聊天建立貓戶與貓咪，`/me` 檢視（Issue #1）。首頁卡片仍使用 `mock-data.ts` 的示意資料（任務 3 改讀真實資料）。日記、相簿、時間軸尚未開始。

## 資料表（Supabase）
- 已建立：`meow_households`（一個帳號最多 2 戶，trigger 限制）、`meow_cats`（visibility null＝沿用貓戶預設、status own/adoptable/adopted）、Storage bucket `meow-cat-photos`（路徑 `<uid>/<uuid>.jpg`）
- 0004 草稿（#57，**尚未執行**）：`meow_cats` 加 `life_stage`（四級，新增時必填）、`personality_tags`、`health_tags`、`description`、`photo_paths`（最多 5）；`status` 預設 `adoptable`；新表 `meow_cat_videos`（每隻最多 3 支、每支 60 秒內，RLS 同貓咪）
- 待建立：`cat_adoption_settings`、`cat_diagnoses`、`cat_ownerships`、`posts`、`post_cats`、`media`

## API／主要函式
- `src/lib/onboarding/household.ts`：縣市＋區解析、驗證、`toHouseholdRow`
- `src/lib/onboarding/cat.ts`：`zodiacOf`、`ageLabel`、`ageBandOf`、`toCatRow`、`validateCat`
- 待建立：公開設定判斷函式、影片 60 秒檢查

## 主要檔案
- `supabase/migrations/0001_meow.sql`
- `src/app/me/page.tsx`（我的貓戶）
- `src/lib/mock-data.ts`（首頁示意資料）

## 決策
- 日記與貼文合併為一種內容，用公開／私密區分。
- 位置只存縣市＋區。
- 必填只有名字、性別、照片。

## 待確認
- 相簿是否需要自訂相簿（FR-04-03 為 Must，可先做自動彙整）。

## 地雷
- 待領養貓必須強制公開，否則配對找不到。
- 私密日記不可進入公開配對向量。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
| 2026-10-28 | Tina × Claude Code | 貓戶、貓咪資料表與 RLS、照片儲存、我的貓戶頁 | #1 |
| 2026-10-29 | Tina × Codex | Issue #33 走查 `/onboarding` → `/me` 流程；未修改資料表或 `/me` 查詢 | #33 |
