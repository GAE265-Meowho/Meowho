# 模組：準備度評估（readiness）

> 最後更新：2026-11-04｜子哲 × Claude Code（#161 建立 3D 房間簡化）
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

- 2026-11-04 中途出領養任務（規格 09 §5.2，#161）：`/cats/[id]/tasks`。三種做法：AI 幫我生成（`POST /api/cats/[id]/tasks/draft`，AI 沒回應時用 `fallbackTaskDraft`）、自己寫（`templateContent`）、先用系統預設任務（`meow_save_cat_tasks(p_use_default => true)`，內容是 0018 的起始版）。內容格式、檢查、動作帶入在 `src/lib/adoption-tasks.ts`；3D 貓的動作由劇情關鍵字帶入（`inferAction`），進行任務時再依房間替換家具。

## 我的 3D 房間與任務裡的 3D（規格 09 §7.2、§7.3）——目前是示範房間，之後要接真正的流程

**現在的做法（2026-11-04，#161，規格 09 v0.6）**
- 環境安全檢查一律和建模同時做、**不再詢問**；`env_check` 不再讀寫（0017 欄位先保留）。上傳前只顯示 §8 的隱私說明（`UPLOAD_PRIVACY`）。
- 喵戶卡片兩顆按鈕的狀態一律用 `homeTools()`（`src/lib/home-room.ts`）：生成 3D 環境／3D 房間處理中（停用）／查看模型；居家安全檢測／安全檢測處理中（停用）／查看報告。房間 `queued`／`running` 時兩顆一起停用；有任何一份 `ready` 報告第二顆就是「查看報告」。
- `/homes/[id]/safety`：有報告顯示最新一份＋檢測紀錄（`safetyRecords()`，來源看 `room_model_id`：null＝單獨檢測）；沒有報告是單獨檢測畫面，上傳先用 `data-proto`，後端還沒做。
- `/homes/[id]/scene` 只有「先用示範房間」：`POST /api/homes/[id]/room` 用 service role 建一筆 `meow_room_models`（`owner_household_id`＝這個喵戶、`status = 'ready'`、`completed_at` 有值、`meta.source = 'default'`、`meta.furniture`＝`DEFAULT_ROOM_FURNITURE`）。
- 進行任務（`/cats/[id]/run`）時顯示這隻貓的 3D 模型＋文字情境；家具替換規則（`src/lib/task-run.ts` 的 `placeFor`）用房間的家具清單算出「在床底」「在櫃子上」這類文字。

**之後要接的流程與位置**

| 步驟 | 要改的地方 | 說明 |
|---|---|---|
| 1. 建立房間 | `src/app/homes/[id]/scene/page.tsx` | 換成兩種輸入（影片、每間房 1～4 張照片；前台先不收平面圖，§10.2）；原始檔放私有 bucket `meow-home-videos`（0017） |
| 2. 背景轉換 | `src/app/api/homes/[id]/room/route.ts` | 換成建 `status = 'queued'` 的房間並排入 MeowHQ 的影片轉換（#93），**同時**建一筆 `meow_env_reports`（`room_model_id`＝房間）；兩者處理完（成功或失敗）立即刪除原始檔並寫 `raw_deleted_at`（決策 007）；成功改 `ready`、通知飼主，失敗附原因 |
| 3. 預覽與完成 | 新的預覽頁 | 預覽、2D 線框修正，按「完成」呼叫 `meow_finish_home_room(房間, null)`；完成畫面換成 §8「你家的 3D 房間和安全報告好了」 |
| 3b. 單獨檢測 | `src/app/homes/[id]/safety/page.tsx` | 拿掉 `data-proto`，接上傳＋AI 風險偵測；報告 `room_model_id = null`，舊報告不覆蓋 |
| 4. 家具清單 | `src/lib/task-run.ts` 的 `roomFurniture` | 已經會讀 `meta.objects[].label`（房間轉換的物品）；確認轉換結果的物品名稱能對到替換規則的關鍵字 |
| 5. 任務裡的 3D | `src/app/cats/[id]/run/page.tsx` 的舞台（`s.stage`） | 換成房間檢視器（`FloorplanViewer`／#150 虛擬體驗）＋把貓放進房間，依任務的 `action` 和 `placeFor` 找到的家具播動作；`textOnly` 時維持文字情境 |
| 6. 拿掉示範房間 | `DEFAULT_ROOM_FURNITURE`、示範房間按鈕 | 流程接好後刪掉；已經建的示範房間可以留著 |

- AI 摘要（`meow_task_runs.summary`）還沒做：完成任務後由伺服器（service role）寫入，對話框的任務證明已經會顯示。

## 資料表（Supabase）
- ［已失效］`env_reports`、`virtual_sessions`、`virtual_tasks`（規劃名稱，改用下列 0017 的表）
- 領養任務：`meow_task_templates`（系統預設任務，依年齡層）、`meow_cat_task_sets`（中途草稿）、`meow_cat_task_versions`（存了就不改）
- 進行任務：`meow_task_runs`（進度、任務證明）、`meow_task_abandons`（放棄任務標籤，只有中途讀得到）
- 我的 3D 房間：`meow_room_models`（`owner_household_id`、`completed_at`、`raw_deleted_at`；`env_check` 11/04 起不再使用，之後的 migration 再移除）；私有 bucket `meow-home-videos`、`meow-home-scenes`
- 環境報告：`meow_env_reports`、`meow_env_report_shares`、`meow_env_report_advice`；私有 bucket `meow-home-risk-crops`。同一個喵戶可以有多份（檢測紀錄），單獨檢測的 `room_model_id` 為 null

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
- ［已失效，見 11-04］2026-11-03（子哲，spec 09）：環境檢查在上傳前詢問、按「完成」時再提醒；居家原始影像改成飼主按「完成」且報告產出後才刪（決策 007 待補充）。
- 2026-11-04（子哲，spec 09 v0.6）：建立 3D 房間簡化成三步，環境檢查一律同時做、不詢問；處理完（成功或失敗）立即刪除原始檔，回到決策 007；可單獨做居家安全檢測，多份報告留成檢測紀錄。

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
| 2026-11-04 | 子哲 × Claude Code | 建立 3D 房間拿掉環境檢查詢問；喵戶卡片按鈕依狀態切換；居家安全檢測報告頁與檢測紀錄 | （見 PR） |
