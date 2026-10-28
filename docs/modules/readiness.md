# 模組：準備度評估（readiness）

> 最後更新：2026-10-28｜Tina × Claude Code
> 規則：本檔隨程式碼同一個 PR 更新；「決策」與「地雷」只增不刪（過時的標註［已失效］）。

## 目的
無經驗領養人的準備度：居家環境 AI 報告、AR 3D 貓（加分）、綁定某隻貓的 7 天虛擬試養。

## 負責
主責：F、D｜支援：E

## 對應需求
- SRS：M08（FR-08-*）
- 測試：UT-08-*、MT-08-*、E2E-03、E2E-08
- PLAN 任務：13、14、18

## 目前狀態
首頁有虛擬試養看板示意（`TrialBoard`）。

## 資料表（Supabase）
- `env_reports`、`virtual_sessions`、`virtual_tasks`

## API／主要函式
- 待建立：環境影片風險偵測、虛擬貓影像生成、情境劇本、任務評分與摘要、Demo 加速模式

## 主要檔案
- `src/components/Sections.tsx`（`TrialBoard`、`Steps`）
- `requirement/catsafe_ar_README.md`（團隊 AR 模組草稿，未放入 repo）

## 決策
- 環境報告（影片＋Vision）為核心，AR 為加分；iOS 降級為 3D 檢視。
- 虛擬試養綁定想領養的那隻貓；同時只能一隻。

## 待確認
- 影像生成方案。

## 地雷
- 植物不可直接判定有毒，只提示查證。
- 居家影片在貓咪移轉完成時刪除原檔。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
