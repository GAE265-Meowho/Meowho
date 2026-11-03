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
- 2026-11-03：目標流程定稿於 `docs/spec/09_領養任務目標流程規格.md`；資料庫 0017 已執行，前台畫面尚未開始。

## 資料表（Supabase）
- ［已失效］`env_reports`、`virtual_sessions`、`virtual_tasks`（規劃名稱，改用下列 0017 的表）
- 領養任務：`meow_task_templates`（系統預設任務，依年齡層）、`meow_cat_task_sets`（中途草稿）、`meow_cat_task_versions`（存了就不改）
- 進行任務：`meow_task_runs`（進度、任務證明）、`meow_task_abandons`（放棄任務標籤，只有中途讀得到）
- 我的 3D 房間：`meow_room_models`（`owner_household_id`、`env_check`、`completed_at`、`raw_deleted_at`）；私有 bucket `meow-home-videos`、`meow-home-scenes`
- 環境報告：`meow_env_reports`、`meow_env_report_shares`、`meow_env_report_advice`；私有 bucket `meow-home-risk-crops`

## API／主要函式
- 0017：`meow_save_cat_tasks()`、`meow_publish_cat()`、`meow_cat_publish_check()`、`meow_start_task_run()`、`meow_abandon_task_run()`、`meow_complete_task_run()`、`meow_share_task_proof()`、`meow_thread_task_status()`、`meow_finish_home_room()`、`meow_share_env_report()`
- 待建立：環境影片風險偵測、情境劇本 AI 生成、任務 AI 摘要、Demo 加速模式

## 主要檔案
- `src/components/Sections.tsx`（`TrialBoard`、`Steps`）
- `requirement/catsafe_ar_README.md`（團隊 AR 模組草稿，未放入 repo）

## 決策
- 2026-10-31（子哲，決策 007）：居家環境原始影片與照片在 3D 場景和環境報告產出後立即刪除，只留風險裁切照；3D 場景只有領養人看得到；環境報告由領養人在私訊中主動分享給喵戶長；喵戶長可對每個風險項目寫建議。
- 環境報告（影片＋Vision）為核心，AR 為加分；iOS 降級為 3D 檢視。
- 虛擬試養綁定想領養的那隻貓；同時只能一隻。
- 2026-11-03（子哲，spec 09）：領養任務在飼主自己的 3D 房間進行；中途改任務時，正在做的人用開始時那版；放棄要選理由，放棄任務標籤只有該貓中途看得到；任務證明非申請必要條件但強烈建議。
- 2026-11-03（子哲，spec 09）：環境檢查在上傳前詢問、按「完成」時再提醒；居家原始影像改成飼主按「完成」且報告產出後才刪（決策 007 待補充）。

## 待確認
- 影像生成方案。
- 7 天任務劇情格式（待和渝茜確認）。
- 系統預設任務的內容與維護者。

## 地雷
- 植物不可直接判定有毒，只提示查證。
- ［已失效］居家影片在貓咪移轉完成時刪除原檔（改見決策 007 與 spec 09）。
- 會員家裡的 3D 房間後台（virtual_assets）也看不到，處理一律走伺服器 service role。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
| 2026-11-03 | 子哲 × Claude Code | 目標流程 spec 09、0017 資料表 | — |
