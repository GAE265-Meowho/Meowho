# 模組：準備度評估（readiness）

> 最後更新：2026-11-04｜珮瑜 × Claude Code（#161 前台我的 3D 房間接上影片轉換）
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

## 我的 3D 房間與任務裡的 3D（規格 09 v0.6 §7.2、§7.3）——目前是示範房間，之後要接真正的流程

**現在的做法（2026-11-04，#161、#173、#174）**
- 環境安全檢查一律和建模同時做、**不再詢問**；`env_check` 不再讀寫（0017 欄位先保留）。上傳前只顯示 §8 的隱私說明（`UPLOAD_PRIVACY`）。
- 喵戶卡片兩顆按鈕的狀態一律用 `homeTools()`（`src/lib/home-room.ts`）：生成 3D 環境／3D 房間處理中（停用）／查看模型；居家安全檢測／安全檢測處理中（停用）／查看報告。房間 `queued`／`running` 時兩顆一起停用；有任何一份 `ready` 報告第二顆就是「查看報告」。
- `/homes/[id]/scene`：拍攝須知＋隱私說明＋「開始製作」「上傳影片」。兩個按鈕都打 `POST /api/homes/[id]/room`，用 service role 建一間**示範房間**（`meow_room_models`：`owner_household_id`＝這個喵戶、`status = 'ready'`、`completed_at` 有值、`meta.source = 'default'`、`meta.furniture`＝`DEFAULT_ROOM_FURNITURE`），**同時寫一份示範報告**（`meow_env_reports`，`room_model_id`＝這間房）。
- `/homes/[id]/safety`：有報告顯示最新一份＋檢測紀錄（`safetyRecords()`，來源看 `room_model_id`：null＝單獨檢測）；「開始檢測」「上傳影片或照片」「再檢測一次」打 `POST /api/homes/[id]/safety`，寫一份示範報告（`demoReportRow()`，內容 `DEMO_REPORT_ITEMS`）。
- 進行任務（`/cats/[id]/run`）時顯示這隻貓的 3D 模型＋文字情境；家具替換規則（`src/lib/task-run.ts` 的 `placeFor`）用房間的家具清單算出「在床底」「在櫃子上」這類文字。
- ⚠ 三支用 service role 的 API（room、safety、`/api/cats/[id]/model`）都需要 Vercel 的 `SUPABASE_SERVICE_ROLE_KEY`；沒讀到時回 `503 not_configured`，畫面顯示「房間建立失敗」「安全檢測失敗」。2026-11-04 子哲已在 Vercel 新增，要重新部署才生效。

### 給珮瑜：把房間模型 API 接到前台（2026-11-04 子哲指派）

目標：飼主在 `/homes/[id]/scene` 按「開始製作」或「上傳影片」後，用 #93 的影片轉 3D 流程建出**自己家的** 3D 房間，取代示範房間。

**和後台 #93 不一樣的地方（一定要守）**

| 項目 | MeowHQ 後台（#93，決策 008） | 前台我的 3D 房間（決策 007、0017） |
|---|---|---|
| 誰的房間 | 示範房間，`owner_household_id` 為 null | 飼主自己家，`owner_household_id`＝喵戶 id |
| 誰能寫 `meow_room_models`／`meow_room_jobs` | 有 `virtual_assets` 權限的管理員（RLS） | 會員**不能**直接寫，只能讀、刪自己的；建立要經伺服器（service role），先用登入者身分確認是自己的喵戶 |
| 原始影片 | 私有 bucket `meow-room-videos` | 私有 bucket `meow-home-videos`，路徑第一層是喵戶 id（`<household_id>/…`）；喵戶長自己上傳，不用簽網址（0017 的 policy 寫錯會一律擋下，0022 修正）；50 MB、mp4／mov |
| 成果 | **公開** bucket `meow-room-models` | **私有** bucket `meow-home-scenes`（`<household_id>/…`），只有自己讀得到；前台用短時效 signed URL 讀，**不能放公開 bucket** |
| 原始檔刪除 | 轉完刪 | 3D 房間和環境報告**都處理完（成功或失敗）立即刪**，並寫 `raw_deleted_at`（決策 007） |
| 環境報告 | 沒有 | 建房間時一律同時建一筆 `meow_env_reports`（`room_model_id`＝房間、`status = 'queued'`） |
| 後台看得到嗎 | 看得到 | 看不到（0017 改了 `virtual_assets` policy，只管 `owner_household_id is null`） |

**步驟與要改的地方**

| 步驟 | 要改的地方 | 說明 |
|---|---|---|
| 1. 上傳 | `src/app/homes/[id]/scene/page.tsx` | 「上傳影片」選檔、「開始製作」用手機錄影（`<input type="file" accept="video/*" capture>`）；瀏覽器用 `sb.storage.from("meow-home-videos").upload("<household_id>/<房間 id>.<副檔名>")` 直傳；格式檢查沿用 `src/lib/hq/rooms/types.ts` 的 `checkVideo()`。上傳中顯示 §8「正在建立你家的 3D 房間。你可以先離開，好了會通知你。」 |
| 2. 建房間＋排工作 | `src/app/api/homes/[id]/room/route.ts` | 收 `{ videoPath }`，確認路徑在這個喵戶底下；用 service role 建 `meow_room_models`（`status = 'queued'`、`source = 'video'`、`video_path`、`owner_household_id`）＋`meow_room_jobs`（`queued`）＋`meow_env_reports`（`queued`、`room_model_id`）。房間 id 沿用 `newRoomId()`／`roomIdAt()` 格式 |
| 3. worker | 珮瑜電腦的 `pipeline/room_worker.py --supabase` | 能領 `owner_household_id` 不是 null 的工作：從 `meow-home-videos` 讀影片、成果寫到 `meow-home-scenes/<household_id>/<房間 id>/`、`result_path` 填這個路徑；成功改 `ready`、失敗改 `failed` 並寫原因；處理完刪影片、寫 `raw_deleted_at`；寫 `meow_notifications` 給喵戶長（連到 `/homes/<id>/scene`）。物品清單放 `meta.objects[].label`（`roomFurniture()` 會讀，名稱要對得到 `placeFor()` 的關鍵字：沙發、床、櫃、椅、書桌、衣櫃、桌、門） |
| 4. 環境報告 | 同一個 worker 或另一支 | 產生 `items`（`[{key, label, level: high/medium/low, note, crop_path}]`）、`summary`，風險裁切照放 `meow-home-risk-crops/<報告 id>/`，改 `ready`／`failed` |
| 5. 處理中與預覽 | `scene/page.tsx`、新的預覽頁 | `homeTools()` 已經會依 `queued`／`running` 停用按鈕；`ready` 後預覽（沿用 #93 的房間檢視器，manifest 從 `meow-home-scenes` 的 signed URL 讀），按「完成」呼叫 `meow_finish_home_room(房間, null)`，之後才能開始領養任務（`meow_start_task_run` 要 `completed_at`） |
| 6. 單獨檢測 | `src/app/api/homes/[id]/safety/route.ts`、`safety/page.tsx` | 同樣上傳到 `meow-home-videos`，只建 `meow_env_reports`（`room_model_id = null`） |
| 7. 拿掉示範 | `src/lib/home-room.ts` 的 `DEMO_REPORT_ITEMS`、`demoReportRow`；`src/lib/task-run.ts` 的 `DEFAULT_ROOM_FURNITURE`；兩支 API 的示範段落 | 真流程在正式站跑通後再刪；已經建的示範房間和報告可以留著 |
| 8. 任務裡的 3D（之後） | `src/app/cats/[id]/run/page.tsx` 的舞台（`s.stage`） | 換成房間檢視器＋把貓放進房間，依任務的 `action` 和 `placeFor` 找到的家具播動作；`textOnly` 時維持文字情境 |

**進度（2026-11-04 珮瑜）**：第 1、2、3、5 步已接上（`feat/161-home-room-video`）。
- 上傳路徑是 `<household_id>/<隨機 uuid>.mp4|mov`（`isHomeVideoPath()` 檢查），房間 id 由伺服器產生；同一個喵戶已有 `queued`／`running` 的房間時回 `409 room_busy`。
- 預覽讀檔走 `GET /api/homes/[id]/room/[roomId]/[...file]`：用登入者身分查房間（RLS），換 10 分鐘 signed URL 再轉過去；檢視器沿用 `RoomViewer`。
- worker（`workers/room-convert`）看 `owner_household_id` 分流；成果路徑 `meow-home-scenes/<household_id>/<房間 id>/`；物品清單從 `scene.json` 轉成中文（`catalog.py` 的 `NAMES_ZH`）寫進 `meta.objects`；完成、失敗都寫通知（`home_room_ready`／`home_room_failed`）。
- **給做環境報告（第 4 步）的人**：影片在 `meow_room_models.video_path`（`meow-home-videos`）。房間 worker 處理完時若報告還是 `queued`／`running`，影片會留著；報告處理完時若房間已不是 `queued`／`running`，就由報告那邊刪影片、把房間的 `video_path` 設 null、寫 `raw_deleted_at`。
- 0017 已建好上面的 bucket、policy、欄位；0022 修正兩條 storage policy（子查詢的 `name` 對到喵戶名稱，喵戶長上傳一律被擋），2026-11-05 珮瑜已在正式資料庫執行。要改資料庫時新開 migration，執行前給子哲確認。
- 要一直保持通過的測試：`src/lib/home-room.test.ts`（按鈕狀態、檢測紀錄）、`src/lib/task-run.test.ts`（家具替換）。
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
- 房間和環境報告剛好同時處理完時，兩邊都以為對方還沒好，影片會留著沒刪；之後要加每天清一次的檢查。
- worker 中斷（`fail_stale`）標成失敗的前台房間不會通知、也不會刪影片。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
| 2026-11-03 | 子哲 × Claude Code | 目標流程 spec 09、0017 資料表 | — |
| 2026-11-04 | 子哲 × Claude Code | 建立 3D 房間拿掉環境檢查詢問；喵戶卡片按鈕依狀態切換；居家安全檢測報告頁與檢測紀錄 | （見 PR） |
| 2026-11-04 | 珮瑜 × Claude Code | 前台我的 3D 房間接上影片轉換：上傳、建房間＋排工作＋環境報告、worker 寫私有 bucket 與通知、預覽與完成 | （見 PR） |
