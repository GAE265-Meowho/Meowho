# 模組：準備度評估（readiness）

> 最後更新：2026-11-06｜渝茜 × Claude Code（#237 虛擬飼養 DEMO）
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

## 虛擬飼養 DEMO（#237，渝茜 × Claude Code，2026-11-06）

網址 `/cats/[id]/play`，DEMO 固定麻糬（改成虎斑；id 不認得也用麻糬）。catgame 縮成 DEMO：
背景 → 上傳房間（模擬）→ AI 居家危險 → 預算與採買 → 擺餐碗／貓砂盆 → 三個節點 → 試養報告。

| 步驟 | 做法 | 真的接上 | 備案（沒有環境變數也能從頭玩到尾） |
|---|---|---|---|
| 玩家背景 | 讀喵戶 `home`（住家型態、住家狀況、同住的人、現有寵物），不問作息與基本資料 | 登入＋有一般飼主喵戶時讀 `meow_households.home`（RLS） | 範例背景 `SAMPLE_HOME`；缺欄位補範例值（`normalizeHome`） |
| 上傳房間 | 選檔或「用示範房間」，進度沿用 `ROOM_STAGES`（加速），檔案不離開瀏覽器 | A 掃描房間：`RoomViewer`＋`NEXT_PUBLIC_ROOM_DEMO_BASE`，物品清單＝`scene.json` 的 `objects[].label` | B 娃娃屋：`DEMO_DOLLHOUSE`（living-room.json＋書桌、電腦、茶几、水杯、櫃子、花瓶），物品清單＝家具＋門窗 |
| 居家危險 | `POST /api/play/hazards`（物品清單；可帶截圖給 vision，前端目前不送） | Azure 聊天部署 | `ruleHazards` 規則對照（電線、窗戶、水杯、花瓶植物、大門、布料家具、細繩） |
| 採買 | 每月預算；照 catgame 原版 `SHOP_ITEMS`／`SHOP_FLAGS` 估價（貓砂類型、砂盆、碗、零食、醫療預備金、貓抓板／外出籠／逗貓棒／監視器）；飼料改用皇家目錄（處方不顯示、待查價不能買、預設只列幼貓，乾糧濕糧各一款） | `src/lib/hq/food/` 目錄 | — （全部公式，`costs.ts`） |
| 擺用品 | 點選位置（手機）或拖進娃娃屋（桌機） | 餐碗組、貓砂盆的公開 GLB | 載入失敗畫同尺寸方塊（`FloorplanViewer` 的錯誤邊界） |
| 三個節點 | 照 catgame 原版推進：台詞＋選項 → 3D 貓配合原版場景姿勢（`goalFor`）→ 小遊戲 → 小叮嚀（page）→ 紀錄；每個節點最後加一段個人化台詞 `POST /api/play/lines`（約 8 秒逾時） | Azure | `ruleLines` |
| 試養報告 | 照原版 `fullReportHTML`：回憶、你和麻糬的 N 年、這一生發生的事、花費（一次性／每月累計／醫療／意外／其他）、做得好／可以再想想、原版規則建議＋AI 補充建議 `POST /api/play/advice`、收養之前問問自己 | Azure | `ruleAdvice` |

- 劇情照 catgame 原版（團隊專題專案 `catgame/src/24i-full-mochi.js` 的 `MOCHI_NODES`，`src/lib/play/story.ts`）：節點 1＝「第 1 天」（躲〈躲藏處〉、店員小安的叮嚀、第一次清砂盆、第一次健檢 1,000 元；原版的 `rand: ["dashout"]` 拿掉）；節點 2＝「五年後」（伴侶過敏三選一含送養結局、陪玩）＋**整場唯一一次居家意外**；節點 3＝「最後一週」「接下來的路」「最後一天」（居家安寧／住院／安樂、享年、`fullLifeWords`）。麻糬的外觀改成虎斑。
- 〈通稱〉照原版 `FURN_WORD`／`homeWord`／`fullTx`（`furniture.ts`），用關鍵字把房間物品名稱對回原版家具 id。
- 居家意外照原版 `FEV`（`events.ts`）：危險 key 對事件 `cable` 咬電線、`string` 吃塑膠繩、`cup`→`table` 跳上桌子、`scratch` 抓家具、`door`→`dashout` 衝出門；全部處理了用 `hairball`／`money`；原版沒有事件的窗戶、植物用一段通用劇情。
- 小遊戲照原版（`src/components/play/catgame/minis.ts`，vanilla JS 包進 client component）：躲床底 `startHide`、鏟屎 `startScoop`、逗貓棒 `startPlay`；共用 `liveFrame`、`trackPointer`、`loopWith`、`miniMeter`、`catParts`…。
- 3D 貓：後台兩隻虎斑示範貓（幼貓 `cat_20261101_183700`、成貓 `cat_20261030_140731`），網址規則同 `bundled.ts`（`src/lib/play/cats.ts`，測試檢查一致）。

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
| 3. worker | `workers/room-convert/pipeline/room_worker.py --supabase`（目前在珮瑜的 Mac 上跑） | 能領 `owner_household_id` 不是 null 的工作：從 `meow-home-videos` 讀影片、成果寫到 `meow-home-scenes/<household_id>/<房間 id>/`、`result_path` 填這個路徑；成功改 `ready`、失敗改 `failed` 並寫原因；處理完刪影片、寫 `raw_deleted_at`；寫 `meow_notifications` 給喵戶長（連到 `/homes/<id>/scene`）。物品清單放 `meta.objects[].label`（`roomFurniture()` 會讀，名稱要對得到 `placeFor()` 的關鍵字：沙發、床、櫃、椅、書桌、衣櫃、桌、門） |
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
- 虛擬飼養 DEMO（#237）：`src/app/cats/[id]/play/page.tsx`、`src/components/play/`（`PlayGame` 流程、`PlayStage` 3D、`RoomStep`、`ShopStep`、`NodeStep`、`ReportStep`、`catgame/` 原版小遊戲）、`src/lib/play/`（`flow.ts` 狀態機、`story.ts` 劇情、`events.ts` 意外、`furniture.ts` 通稱、`hazards.ts`、`costs.ts`、`room.ts`、`stage.ts`、`background.ts`、`lines.ts`、`report.ts`、`items.ts`、`cats.ts`、`api.ts`、`handlers.ts`）、`src/app/api/play/{hazards,lines,advice}/route.ts`、`src/lib/ai/play.ts`、`src/lib/prompts/play.ts`
- `requirement/catsafe_ar_README.md`（團隊 AR 模組草稿，未放入 repo）

## 決策
- 2026-10-31（子哲，決策 007）：居家環境原始影片與照片在 3D 場景和環境報告產出後立即刪除，只留風險裁切照；3D 場景只有領養人看得到；環境報告由領養人在私訊中主動分享給喵戶長；喵戶長可對每個風險項目寫建議。
- 環境報告（影片＋Vision）為核心，AR 為加分；iOS 降級為 3D 檢視。
- 虛擬試養綁定想領養的那隻貓；同時只能一隻。
- 2026-11-03（子哲，spec 09）：領養任務在飼主自己的 3D 房間進行；中途改任務時，正在做的人用開始時那版；放棄要選理由，放棄任務標籤只有該貓中途看得到；任務證明非申請必要條件但強烈建議。
- ［已失效，見 11-04］2026-11-03（子哲，spec 09）：環境檢查在上傳前詢問、按「完成」時再提醒；居家原始影像改成飼主按「完成」且報告產出後才刪（決策 007 待補充）。
- 2026-11-04（子哲，spec 09 v0.6）：建立 3D 房間簡化成三步，環境檢查一律同時做、不詢問；處理完（成功或失敗）立即刪除原始檔，回到決策 007；可單獨做居家安全檢測，多份報告留成檢測紀錄。

- 2026-11-06（渝茜，#237）：虛擬飼養 DEMO 縮成 3 個節點；居家意外整場只有一次、固定在節點 2，從 AI 辨認出而玩家沒處理的危險挑；遊戲狀態只放前端，不新增資料表；所有金額由 `src/lib/play/costs.ts` 公式算，AI 只寫文字。
- 2026-11-06（渝茜，#237）：劇情、居家意外、採買估價、小遊戲、試養報告照 catgame 原版；原版沒有、但 DEMO 需要的（AI 危險清單、模擬上傳、擺用品、個人化台詞）保留。
- 2026-11-06（渝茜，#237）：生活用品（餐碗組、貓砂盆）先用公開 bucket `meow-items` 的模型網址，尺寸與價格寫在 `src/lib/play/items.ts`；等子哲開放 `meow_items`／`meow_item_categories` 公開讀取後改讀後台（#237 已提醒）。

## 待確認
- 影像生成方案。
- ［已處理，2026-11-06］虛擬飼養 DEMO 的劇情與小遊戲已改成照 catgame 原版。
- `meow_items` 是否開放公開讀取（子哲）；餐碗組路徑 `test_bowls_…` 是測試上傳，正式版換掉時 `items.ts` 也要改。
- 7 天任務劇情格式（待和渝茜確認）。
- 系統預設任務的內容與維護者。

## 地雷
- 植物不可直接判定有毒，只提示查證。
- ［已失效］居家影片在貓咪移轉完成時刪除原檔（改見決策 007 與 spec 09）。
- 會員家裡的 3D 房間後台（virtual_assets）也看不到，處理一律走伺服器 service role。
- 房間和環境報告剛好同時處理完時，兩邊都以為對方還沒好，影片會留著沒刪；之後要加每天清一次的檢查。
- worker 中斷（`fail_stale`）標成失敗的前台房間不會通知、也不會刪影片。
- 虛擬飼養 DEMO：生活用品模型是 Supabase 公開網址，連不到時 dev 模式 console 會印 GLB 載入錯誤（預期），畫面已換成同尺寸方塊；`FloorplanViewer` 的 `catGoal`／`catClip`／`catSpeed`／`onItemError` 是 DEMO 加的選用屬性，後台虛擬體驗不傳。
- 虛擬飼養 DEMO：掃描房間（`RoomViewer`）不能放用品模型、貓的動作由 RoomViewer 自己處理，劇情只用文字；沙盒沒實測過掃描房間、Azure、喵戶讀取、遠端 GLB。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
| 2026-11-03 | 子哲 × Claude Code | 目標流程 spec 09、0017 資料表 | — |
| 2026-11-04 | 子哲 × Claude Code | 建立 3D 房間拿掉環境檢查詢問；喵戶卡片按鈕依狀態切換；居家安全檢測報告頁與檢測紀錄 | （見 PR） |
| 2026-11-04 | 珮瑜 × Claude Code | 前台我的 3D 房間接上影片轉換：上傳、建房間＋排工作＋環境報告、worker 寫私有 bucket 與通知、預覽與完成 | （見 PR） |
| 2026-11-06 | 渝茜 × Claude Code | 虛擬飼養 DEMO `/cats/[id]/play`：3 個節點、AI 危險／台詞／建議（含規則備案）、採買花費公式、3D 娃娃屋擺用品、小遊戲、試養報告 | #244 |
| 2026-11-06 | 渝茜 × Claude Code | 虛擬飼養 DEMO 劇情、事件、採買、小遊戲、試養報告改成照 catgame 原版 | #244 |
