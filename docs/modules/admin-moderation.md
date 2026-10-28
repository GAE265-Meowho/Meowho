# 模組：後台與內容審核（admin-moderation）

> 最後更新：2026-10-28｜Tina × Claude Code
> 規則：本檔隨程式碼同一個 PR 更新；「決策」與「地雷」只增不刪（過時的標註［已失效］）。

## 目的
管理員後台（知識庫、產品價格、中途認證、檢舉、Demo 模式、站台標誌）與 AI 內容審核。

## 負責
主責：C、E｜支援：B

## 對應需求
- SRS：M15（FR-15-*）、M16（FR-16-*）
- 測試：UT-15-*、UT-16-*、MT-15-*、MT-16-*、E2E-06、E2E-07
- PLAN 任務：17

## 目前狀態
站台標誌設定已完成原型（頁尾「管理者設定」或網址 `?admin`），存 localStorage。

## 資料表（Supabase）
- `reports`、`shelter_verifications`、`site_settings`（待建立，存標誌選擇）

## API／主要函式
- 待建立：白名單登入、檢舉處理、影像與文字審核

## 主要檔案
- `src/components/Providers.tsx`（logo 狀態）、`src/components/Chrome.tsx`（`AdminLogoDialog`）、`src/lib/mock-data.ts`（`LOGOS`）

## 決策
- 不更換 logo 檔案，只能由管理者在 3 款中選擇。

## 待確認
—

## 地雷
- 原型的管理者設定任何人都能開；任務 17 必須加上權限檢查。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
