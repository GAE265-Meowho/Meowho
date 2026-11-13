# 模組：準備度評估（readiness）

> 最後更新：2026-11-10｜Jerry0808 × Codex（#277 報告摘要優先）
> 規則：本檔隨程式碼同一個 PR 更新；「決策」與「地雷」只增不刪（過時的標註［已失效］）。

## 目的
無經驗領養人的準備度：居家環境 AI 報告、AR 3D 貓（加分）、綁定某隻貓的虛擬試養（3 個節點：到家第一天、五年後、臨終前）。

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

### 入口與「要演哪隻貓」的接口（2026-11-09，子哲 × Claude Code，#273）

- **入口**：貓咪頁 `/cats/[id]` 的「進行領養任務」改連 `/cats/[id]/play`（原本連 `/cats/[id]/run`）。首頁貓卡的「7 天虛擬飼養」按鈕已刪，`7 天虛擬飼養` 只留在頁首導覽，當作跳到首頁 `#trial` 區塊的錨點。
- **接口**：`src/lib/play/source.ts` 的 `loadPlayCat(catId)` 回傳 `PlayCatSource`（`catId`、`name`、`coat`、`demo`、`look(body)`）；`PlayGame` 改成從 `cat` 屬性拿名字、毛色和 3D 外觀，不再直接 import `PLAY_CAT`／`playCatLook`。
- **現在**：`loadPlayCat` 一律回 DEMO 麻糬（`demo: true`）。**下一步（渝茜）**：在 `loadPlayCat` 裡用 `catId` 讀 `meow_cats` 和這隻貓確認過的 `meow_cat_models`，讀不到時退回 `demoPlayCat`；`story.ts` 裡寫死的「麻糬」要換成 `name`。
- 原本的任務頁 `/cats/[id]/run`（0030 任務進度、試養報告、對話串分享）保留；問卷頁和對話串的「去做任務」仍連到那裡，之後要不要一起改由團隊決定。

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
| 原始影片 | 私有 bucket `meow-room-videos` | Azure 私有容器（`media-dev`／`media`）`homes/<household_id>/videos/<影片 id>.<mp4|mov>`（#273）；主站確認是喵戶長後簽短效上傳網址，瀏覽器直傳；300 MB、180 秒、mp4／mov（#243）。11/07 以前的影片在 Supabase `meow-home-videos`，先不刪，有容量警告再刪 |
| 成果 | **公開** bucket `meow-room-models` | **私有** bucket `meow-home-scenes`（`<household_id>/…`），只有自己讀得到；前台用短時效 signed URL 讀，**不能放公開 bucket** |
| 原始檔刪除 | 轉完刪 | 3D 房間和環境報告**都處理完（成功或失敗）**後，由主站的清理程式刪並寫 `raw_deleted_at`（決策 007、#242）；兩支 worker 都不刪 |
| 環境報告 | 沒有 | 建房間時一律同時建一筆 `meow_env_reports`（`room_model_id`＝房間、`status = 'queued'`） |
| 後台看得到嗎 | 看得到 | 看不到（0017 改了 `virtual_assets` policy，只管 `owner_household_id is null`） |

**步驟與要改的地方**

| 步驟 | 要改的地方 | 說明 |
|---|---|---|
| 1. 上傳 | `src/app/homes/[id]/scene/page.tsx` | 「上傳影片」選檔、「開始製作」用手機錄影（`<input type="file" accept="video/*" capture>`）；`POST /api/homes/[id]/videos` 先用 service role 記一筆 `meow_home_videos`（`status = 'uploading'`，路徑裡的 uuid＝這筆的 `id`），再簽 Azure 上傳網址（`getMediaStore().uploadUrl`），回 `{ videoId, path, upload }`，瀏覽器直傳；紀錄寫不進去就不簽網址（#346）；格式、大小、長度用 `src/lib/home-room.ts` 的 `checkHomeVideo()`，前台和 API 各檢查一次。上傳中顯示 §8「正在建立你家的 3D 房間。你可以先離開，好了會通知你。」 |
| 2. 建房間＋排工作 | `src/app/api/homes/[id]/room/route.ts` | 收 `{ videoId }`，用 service role 讀這個喵戶、`purpose = 'room'`、還沒清掉的 `meow_home_videos`，路徑一律用這筆的 `path`；影片改 `uploaded` → 建 `meow_room_models`（`status = 'queued'`、`source = 'video'`、`video_path`、`owner_household_id`）→ 呼叫 `meow_create_home_processing(videoId, roomId, videoId)`，在同一個交易裡建 `meow_room_jobs`、`meow_env_jobs`、`meow_env_reports`（含 `video_id`）和 `meow_home_processing_requests`（#346）。request id 用 `videoId`，重送拿回同一組；失敗時刪房間、Azure 影片和影片紀錄。房間 id 沿用 `newRoomId()`／`roomIdAt()` 格式 |
| 3. worker | `workers/room-convert/pipeline/room_worker.py --supabase`（目前在珮瑜的 Mac 上跑） | 能領 `owner_household_id` 不是 null 的工作：從 Azure 讀影片（下載後再檢查一次 #243 的限制）、成果寫到 `meow-home-scenes/<household_id>/<房間 id>/`、`result_path` 填這個路徑；成功改 `ready`、失敗改 `failed` 並寫原因；不刪影片（#242）；寫 `meow_notifications` 給喵戶長（連到 `/homes/<id>/scene`）。物品清單放 `meta.objects[].label`（`roomFurniture()` 會讀，名稱要對得到 `placeFor()` 的關鍵字：沙發、床、櫃、椅、書桌、衣櫃、桌、門） |
| 4. 環境報告 | 同一個 worker 或另一支 | 產生 `items`（`[{key, label, level: high/medium/low, note, crop_path}]`）、`summary`，風險裁切照放 `meow-home-risk-crops/<報告 id>/`，改 `ready`／`failed` |
| 5. 處理中與預覽 | `scene/page.tsx`、新的預覽頁 | `homeTools()` 已經會依 `queued`／`running` 停用按鈕；`ready` 後預覽（沿用 #93 的房間檢視器，manifest 從 `meow-home-scenes` 的 signed URL 讀），按「完成」呼叫 `meow_finish_home_room(房間, null)`，之後才能開始領養任務（`meow_start_task_run` 要 `completed_at`） |
| 6. 單獨檢測 | `src/app/api/homes/[id]/safety/route.ts`、`safety/page.tsx` | 同樣上傳到 `meow-home-videos`，只建 `meow_env_reports`（`room_model_id = null`） |
| 7. 拿掉示範 | `src/lib/home-room.ts` 的 `DEMO_REPORT_ITEMS`、`demoReportRow`；`src/lib/task-run.ts` 的 `DEFAULT_ROOM_FURNITURE`；兩支 API 的示範段落 | 真流程在正式站跑通後再刪；已經建的示範房間和報告可以留著 |
| 8. 任務裡的 3D（之後） | `src/app/cats/[id]/run/page.tsx` 的舞台（`s.stage`） | 換成房間檢視器＋把貓放進房間，依任務的 `action` 和 `placeFor` 找到的家具播動作；`textOnly` 時維持文字情境 |

**進度（2026-11-04 珮瑜）**：第 1、2、3、5 步已接上（`feat/161-home-room-video`）。
- 上傳路徑是 `homes/<household_id>/videos/<隨機 uuid>.mp4|mov`（2026-11-07 起放 Azure，#273；`isHomeVideoPath()` 檢查；11/10 起 uuid＝`meow_home_videos.id`，#346）；建房間失敗時 API 會刪掉剛傳的影片和影片紀錄，房間 id 由伺服器產生；同一個喵戶已有 `queued`／`running` 的房間時回 `409 room_busy`。
- 預覽讀檔走 `GET /api/homes/[id]/room/[roomId]/[...file]`：用登入者身分查房間（RLS），換 10 分鐘 signed URL 再轉過去；檢視器沿用 `RoomViewer`。
- worker（`workers/room-convert`）看 `owner_household_id` 分流；成果路徑 `meow-home-scenes/<household_id>/<房間 id>/`；物品清單從 `scene.json` 轉成中文（`catalog.py` 的 `NAMES_ZH`）寫進 `meta.objects`；完成、失敗都寫通知（`home_room_ready`／`home_room_failed`）。
- **給做環境報告（第 4 步）的人**：影片在 `meow_room_models.video_path`（Azure）。兩支 worker 都不刪影片，由主站的清理程式刪（#242，2026-11-07 起）。
- 0017 已建好上面的 bucket、policy、欄位；0022 修正兩條 storage policy（子查詢的 `name` 對到喵戶名稱，喵戶長上傳一律被擋），2026-11-05 珮瑜已在正式資料庫執行。要改資料庫時新開 migration，執行前給子哲確認。
- 要一直保持通過的測試：`src/lib/home-room.test.ts`（按鈕狀態、檢測紀錄）、`src/lib/task-run.test.ts`（家具替換）。
- AI 摘要（`meow_task_runs.summary`）還沒做：完成任務後由伺服器（service role）寫入，對話框的試養報告已經會顯示。

## 虛擬飼養改版待辦（渝茜提出，2026-11-07，尚未開工）

> 以後問「虛擬飼養之後要改什麼」就看這一節。README 的「文件」表有連到這裡。

### A. 正式流程（渝茜 2026-11-07；✅ 已拿掉兩關，尚未 commit）
- 順序：飼養人先上傳環境（上傳完顯示環境報告）→ 首頁挑貓 → 直接進遊戲。
- ✅ **「上傳房間」「居家安全」兩關已從遊戲拿掉**：`flow.ts` 的 `STEPS` 現在是 `background → shop → place → node → report`，進度列「你的家／採買／擺用品／飼養／報告」。`RoomStep.tsx` 已刪。
  - 空間：進頁面時在背景自動讀（`PlayGame.tsx`：自己的房間 ＞ 公開示範房間 ＞ 範例娃娃屋，見下方「房間資料來源」），讀到前「你的家」的按鈕不能按（「讀取你的空間…」）。
  - 居家安全建議：由**環境報告**顯示，不再在遊戲裡勾「我會處理」。試養報告不寫家裡的物件與位置（2026-11-07 紀錄的決策不變），只提醒「環境報告裡有幾項居家安全建議，接貓回家前先照報告處理好」（`report.ts` 的 `ruleAdvice`）。
  - **居家危險資料仍保留**，只給故事事件用：房間讀到後在背景先用規則對照（`ruleHazards`）算出危險，再請 `/api/play/hazards`（AI）覆蓋；節點 5 居家意外取風險最高的一項（`topRisk`）。`state.handled` 現在永遠是空的（API 的 `handled` 欄位保留不動）。
  - 之後接世安的環境報告 API：把 `PlayGame.tsx` 裡「居家危險」那段 effect 的來源換成報告資料即可。
- 採買、擺用品**保留**（渝茜確認）。
- 還沒做：進場判斷「有沒有環境報告」。目前一律當作有（讀自己的房間或公開示範房間）；沒有環境報告時要導去上傳環境。卡點：`/me` 的「生成 3D 環境」還顯示「安全檢測處理中」，沒有可讀的報告 API。

### 房間資料來源（2026-11-07 issue 回覆，子哲／世安）
- 房間 3D 成果在 Supabase 私有 bucket `meow-home-scenes`，只有喵戶長本人讀得到（決策 007），Azure 只放原始影片；所以用別人的帳號讀會 404，不是壞掉。
- 公開示範房間（不屬於任何喵戶）：房間 id `room_20261107_031215_1`（名稱「子哲的家（11/07 影片）」），resultBase `https://onebpkbkrnnwamwsoelo.supabase.co/storage/v1/object/public/meow-room-models/results/5c7534dca1c6b2c0/`，含 `scene.json`、`scene.layout.json`、`scene.cameras.json`、`thumb.jpg`、`objects/room_cut.splat` 和 5 個可推動小物 splat。
- 沒有 `scene.splat` 是正常的：有 `room_cut.splat` 時檢視器改讀 `room_cut`（`RoomViewer` 已支援）。
- 房間有 30 樣物件。可跳上去：床、書桌、椅子、抽屜櫃、冰箱；可躲下面：書桌、椅子。電風扇切出 8 個，有幾個很小可能是誤判，演出時略過。
- ✅ 已改（2026-11-07，尚未 commit）：掃描房間資料夾網址由 `pickScanBase`（`src/lib/play/room.ts`）決定：**自己的房間**（`DEFAULT_ROOM_ID` `room_20261107_031215`，子哲喵戶的私有房間，只有房間主人查得到）＞ 環境變數 `NEXT_PUBLIC_ROOM_DEMO_BASE` ＞ **公開示範房間**（`DEMO_ROOM_ID` `room_20261107_031215_1`、`DEMO_ROOM_BASE`）。其他帳號原本讀不到私有房間所以退回平面圖娃娃屋，現在會看到 3D 掃描房間。
- scene.json 的 `objects[].label` 是英文（bed、desk…），中文在 `name_zh`；`inventoryFromScan` 優先用 `name_zh`，沒有才用 `label`。
- ✅ 已做（2026-11-07，尚未 commit）**擺的虛擬用品會出現在 3D 掃描房間裡**：玩家在「擺用品」選「床旁」「房間角落」等，`src/lib/play/scene-items.ts` 的 `placeScanItems` 換成房間地板座標（公尺，同貓和物品箱子的 x 沿 e1、z 沿 e2），在房間內、能走的地板上、不重疊；`RoomViewer`（後台元件）新增 `items` 屬性，用和貓一樣的座標框架把 GLB 放進去，模型依後台登錄的寬深高縮放（載入失敗畫同尺寸方塊）。`RoomObject` 加了 `name_zh`（中文名稱）。
- ✅ 遊戲裡的 3D 房間**不再顯示拍攝點與貓咪動作按鈕**（上一個／下一個拍攝點、叫貓過來、跳上床、推倒杯子、重置物品）：`RoomViewer` 新增 `controls` 屬性（預設 true，後台頁面不變），`PlayStage` 傳 `controls={false}`；拖曳轉頭、WASD、點地板叫貓仍可用。
- ✅ 已做（2026-11-09）**鏡頭不能走出房間**：拉太遠、降太低會看到牆和地板的背面。`RoomViewer` 每幀用 `clampInRoom()`（`src/lib/hq/rooms/demo.ts`）把鏡頭夾在 `scene.json` 的 `room` 範圍內（依 `room.yaw` 沿牆方向、離牆 0.15 m、高度 0.2～2.2 m）；WASD、Q／E、滾輪、右鍵平移都適用，飛往拍攝點的途中不夾。後台、我的 3D 房間、虛擬飼養共用。
- ✅ 已做（2026-11-07，尚未 commit）**3D 逗貓（掃描房間）**：在家的時光按「逗貓」、或節點裡的逗貓小遊戲，改在 3D 掃描房間玩（娃娃屋仍用原本 2D）。玩具是後台「逗貓棒」的老鼠模型（`PlayShop.models.toy`，後台沒有就用 `items.ts` 的 `PLAY_TOY`），畫面上放大 6 倍；玩具跟著滑鼠／手指在地板上移動（`RoomWorld.floorAt`），貓用位置移動追過去、撲（沿用 `RoomCat.playWith`，不需要撲跳動畫），貓衝刺（跑步動作、約 1.9 公尺/秒）到玩具旁，碰得到（30 公分內）才撲，撲的瞬間貓與玩具仍在 30 公分內才算抓到（隔很遠不算）；每抓到一次開心度 +17（3 次過 50 算成功），沒有時間限制，按「先到這裡」結束，結果格式與 2D 逗貓相同（`catchResult`）。元件：`ScanWand.tsx`（計時、抓到次數、開心度）、`RoomViewer` 新增 `wand` 屬性（逗貓時停用拖曳轉頭）。純函式與測試：`scene-cat.ts`／`scene-cat.test.ts`。
- ✅ 已做（2026-11-07，尚未 commit）**劇情動作接上 3D 掃描房間的貓（B4）**：`RoomViewer` 新增 `story` 屬性，`sceneCatCommand` 把劇情的貓動作換成房間裡的指令：沒有動作＝貓不在場（隱藏）；carrier／eat／litter＝走到擺好的外出籠／餐碗／貓砂盆；hide＝走到可躲的家具底下（沒有就隱藏）；sleep／sofa／high＝跳上床／沙發／最高的家具；explore／idle＝照常閒晃。`RoomWorld.command` 執行（走路、跳、隱藏）。餵飼料、換水仍是 2D 計時條（之後才改 3D）。
- ✅ 已做（2026-11-07，尚未 commit）**貓不再穿過擺進房間的用品**：`footprintCells`（`scene-items.ts`，含 4 公分邊距）算出用品佔的格子，`RoomWorld.setItems` → `RoomCat.blockCells` 設成不能走（換清單時先還原）；走向外出籠、碗、砂盆時會停在旁邊。
- ✅ 已做（2026-11-07，尚未 commit）**餵貓、換水、剪指甲、刷牙、外出籠改回原版 catgame 小遊戲**（搬自 `catgame/src/20-mini-feed、21-mini-water、22-mini-nail、13-mini-brush、16-mini-carrier`，不用計時條）；結果格式照原版，`careGood` 依結果判定成功（`care.test.ts`）；刷牙訓練階段依做過幾次逐階升級。3D 逗貓修了「指標事件被檢視器攔下」與「貓在閒晃時不來追」。
- ✅ 已做（2026-11-07，尚未 commit）**在家的時光的動作可以重複做**（渝茜）：`flow.ts` 的 `care` 不再擋已做過的動作，`HomeStep` 不再停用按鈕（顯示「已做，可再做」）；每次都套用效果，數值夾在 0~100，所以重複只會到上限。「沒做的動作扣數值」仍以這一輪有沒有做過一次判斷。
- 還沒做：B5（沒有環境報告時導去上傳環境）。劇情動作用瀏覽器實測了外出籠與逗貓，其他動作（跳床、躲床底、貓砂盆）只有純函式測試，建議在有完整家具的房間再走一遍。
- 公開示範房間沒有窗戶，所以居家安全清單不會出現「窗戶」「電線」那幾項（依房間物品產生）。
- 之後接新流程（環境先上傳）時：玩家自己的房間要放在 `pickScanBase` 的第一順位，公開示範房間只當沒有房間時的備案。

### C. 花費與用品串後台（渝茜 2026-11-07 確認；✅ 已做，尚未 commit）
- 原則：**後台有就用後台，後台沒有就先用程式裡自己寫的；後台之後補上傳，遊戲自動抓到，不用改程式。**
- 資料流：後台 `meow_items` → 伺服器 API `GET /api/play/items`（service role 代讀，因為 RLS 只給管理員；只回類別名稱、品名、價格、模型網址、尺寸；沒設定金鑰或失敗回 `{ items: [] }`）→ `src/lib/play/catalog.ts`（`toPlayCatalog`、`playShop`）→ 前台 `PlayGame.tsx` 的 `usePlayShop`。不需要等子哲開放 `meow_items` 公開讀取。
- 對照表（用**後台類別名稱**比對，在 `catalog.ts`）：

| 後台類別 | 遊戲裡怎麼用 | 後台沒有時 |
|---|---|---|
| 貓抓板、逗貓棒 | 勾選用品的價格（同類多個取最便宜） | 原版 300、200 |
| 貓砂盆 → 砂盆、餐碗水碗 → 碗 | **每個後台品項就是一個選項**（品名、價格，價格由低到高）；後台補上傳更多品項選項自動變多 | 原版選項（砂盆 4 個、碗 3 個） |
| 外出籠、餐碗水碗、貓砂盆 | 擺進房間的 3D 模型網址與公尺尺寸（網址和三個尺寸都有才採用） | `items.ts` 寫死的模型 |
| 外出籠 | **免費**（中途送的），價格不計，不在採買清單 | 同左 |
| 貓砂、零食、醫療預備金、監視器 | 沒有後台品項，維持原版估價 | 原版 |

- 新增後台類別要讓遊戲抓到：在 `catalog.ts` 的 `FLAG_CATEGORY`／`OPTS_CATEGORY`／`MODEL_CATEGORY` 加一列。**類別名稱要和後台一字不差**（現在是「貓抓板」「逗貓棒」「貓砂盆」「餐碗水碗」「外出籠」）。
- 現況：後台貓砂盆 1,127、餐碗組 399 各只有一個品項，所以砂盆、碗目前只剩一個選項（原版有 4、3 個）；之後後台補上傳（例如有蓋、飲水機）就會變多。
- 測試：`catalog.test.ts`、`costs.test.ts`、`items.test.ts`。本機 `.env.local` 沒有 `SUPABASE_SERVICE_ROLE_KEY`，只在瀏覽器驗證了備案；後台資料實際生效要在有金鑰的環境（Vercel）確認。
- 逗貓棒（老鼠）模型（`meow-items/87c99fc9-…/model.glb`，0.054 × 0.024 × 0.028 公尺）已能由 API 帶回，3D 逗貓小遊戲做的時候再接。

### B. 小遊戲改 3D（逗貓、餵飼料、換水）
- 現況：三個都是 2D 小遊戲。逗貓在 `catgame/minis.ts` 的 `startPlay`；餵貓（放飯）、換水、剪指甲、刷牙、外出籠都已換成原版 catgame 小遊戲（拖飼料袋、洗水碗、剪指甲、刷牙五階段、放零食引進籠子），在 `catgame/minis.ts`（原本的停在綠線計時條 `CareMini.tsx` 已刪）。
- 逗貓：在 3D 房間放一支 3D 逗貓棒跟著滑鼠或手指移動；貓依位置追逐。**3D 貓模型沒有撲、跳動作也沒關係，用「位置移動」做**（貓平移、轉向、短距離位移當作撲），開心度由撲中次數算。
- 餵飼料、倒水：需要碗、飼料、水的 3D 物件，貓走到碗邊（`stage.ts` 已有貓走向外出籠的做法可參考）。現在不好改，先記錄；做的時候沿用逗貓的「位置移動」做法。
- 逗貓棒模型：渝茜已在後台「生活用品」上傳，品項「老鼠」（英文 mickey，id `5ab12238-f07c-44ba-abf5-83631dfbe45a`），模型 `https://onebpkbkrnnwamwsoelo.supabase.co/storage/v1/object/public/meow-items/87c99fc9-da88-4882-94e3-7f3bc3c00d09/model.glb`，尺寸 0.054 × 0.024 × 0.028 公尺（寬×深×高），價格未填。程式要從後台 `meow_items` 讀，但前台沒登入時讀不到（只有管理員 API `/api/hq/items` 讀得到），在子哲開放公開讀取前，先像 `items.ts` 那樣寫死網址與尺寸。
- ✅ 已處理（2026-11-07）：後台「外出籠」尺寸原本登錄成原始模型單位 2.216 × 3.428 × 2.046，已用 SQL 改成 0.33 × 0.51 × 0.31 公尺（與 `items.ts` 一致），改讀後台時外出籠不會變巨大。
- 前置：確認 `PlayStage.tsx` 的 3D 貓可由程式直接設位置、方向，不依賴動畫片段。
- 🚧 進行中（2026-11-12，珮瑜 × Claude Code，#354，分支 `feat/354-care-water-3d`）**換水改 3D（第 1 份）**：`CatgameMini.tsx` 的換水改開彈窗（`mini3d/Mini3DModal.tsx`），裡面是第一視角開水龍頭的 `mini3d/WaterRefillGame3D.tsx`。
  - 玩法：前三格自動播（右手拿舊水碗到水槽、倒掉舊水、空碗移到出水口下），之後玩家按住按鈕，左手握把手開水、放開關水，按「倒好了」結束。規則和回傳沿用 `lib/play/mini3d/water-rules.ts`（`{ fill }`，fill ≥ 70 算換好）。
  - 道具：`WaterProps.tsx`（`WaterBowl` 水碗、`WaterSink` 水槽，程式畫）、`WaterTap.tsx`（`water_tap` 水龍頭，程式畫，把手獨立可抬）、`WaterHands.tsx`（`water_hand_right`／`water_hand_left`，模型在 `public/play/`，CC0，手勢是程式套的）。
  - 動作：`WaterRefillScene.tsx` 擺畫面；每個時間點的數值在 `lib/play/mini3d/refill-timeline.ts`（六格時間軸 `refillAt`、玩家按住／放開 `refillHold`，有測試）。
  - 原本同分支上還有一個拖水壺到水碗上方倒水的版本（`mini3d/WaterGame3D.tsx`），2026-11-12 珮瑜決定只留水龍頭版，已刪（沒進過 git）。`mini3d/useScenePointer.ts` 是它用的拖曳工具，現在沒有人用，留給之後的 3D 小遊戲。
  - 還沒做：音效、水花、從真正的 `/cats/[id]/play` 流程實測、手機取景；細節見 `docs/daily/2026-11-12/1427-珮瑜-354.md`。
- 🚧 進行中（2026-11-12，珮瑜 × Claude Code，#354，分支 `feat/354-care-feed-3d`，疊在換水分支上）**餵貓改 3D（第 1 份）**：`CatgameMini.tsx` 的餵貓改開彈窗，裡面是第一視角的 `mini3d/FeedGame3D.tsx`。
  - 玩法（2026-11-13 改）：**一餐只餵一種**，彈窗一開先選乾飼料、主食罐或湯罐，選了手就伸進來（乾飼料是右手拿飼料袋，罐頭是左手拿著沒開的罐頭）。乾飼料按住倒，掉出來的是一顆一顆的顆粒；罐頭按「開一罐」播「右手拉開拉環、左手倒進碗」，主食罐是一坨濕食、湯罐是半透明的液體，可以連開幾罐（湯罐一罐不夠）。按「放好了」結束。
  - 規則：`lib/play/mini3d/feed-rules.ts`（建議份量 `feedPortion`、`pourDry`、`addCan`、`feedResult`、開罐頭動作 `canFrame`，有測試），數值照 2D 版；回傳 `{ added, over, wet, soup, spill }`，`careGood("feed")` 沒有動。
  - 道具：`mini3d/FeedProps.tsx`（`feed_bag` 飼料袋、`feed_can` 罐頭兩種、碗裡的東西 `BowlFood`、落下的顆粒 `KibbleFall`，都是程式畫）；場景 `mini3d/FeedScene.tsx`；手多一個手勢 `hold`。
  - **彈窗只放飼料，貓不在裡面**：`PlayGame.tsx` 改成餵貓、換水做完、彈窗關掉後貓才走到碗邊（`served`）；取消不會觸發。吃、喝的動作等第 4 份。
  - 還沒做：在真正的房間流程確認貓有走過去、手機實測、音效、包裝圖案；第 1 份還剩鏟屎、逗貓玩具確認、上方狀態列。細節見 `docs/daily/2026-11-12/1514-珮瑜-354.md`。
- 🚧 進行中（2026-11-12，珮瑜 × Claude Code，#354，分支 `feat/354-care-scoop-3d`，疊在餵貓分支上）**鏟屎改 3D（第 1 份）**：`CatgameMini.tsx` 的鏟屎改開彈窗，裡面是第一視角的 `mini3d/ScoopGame3D.tsx`。
  - 玩法（六格分鏡）：按住畫面拖曳貓砂鏟 → 連砂一起鏟起來（一次最多三塊）→ 左右來回甩三下把砂甩掉 → 拿到左邊垃圾袋上方放開，鏟子傾斜倒進去。動作太大掉一塊回砂裡；沒到垃圾袋就放開全部掉回去；沒甩乾淨也丟得進去，但提示浪費砂。
  - 規則：`lib/play/mini3d/scoop-rules.ts`（`newScoop`、`scoopStep`、`scoopResult`，有測試）；回傳 `{ bagged, total, small, sandy }`，`sandy` 是連砂一起丟掉的塊數，`careGood("scoop")` 不看內容。
  - 道具：`mini3d/ScoopProps.tsx`（貓砂盆四款 `LitterBox`、`scoop_shovel`、`scoop_bag`、`scoop_poop`、`scoop_clump`，都是程式畫）；場景 `mini3d/ScoopScene.tsx`，拖曳用 `mini3d/useScenePointer.ts`。
  - **還沒接的**：採買選的貓砂盆款式沒有帶進小遊戲（一律開放式）；房間裡的貓砂盆仍是原本那一個模型，四款只在彈窗裡；貓上完廁所砂盆多一條大便沒做。
  - 還沒做：手機實測、甩的靈敏度調整、音效。細節見 `docs/daily/2026-11-12/2130-珮瑜-354.md`。
- 🚧 審查中（2026-11-13，Tina × Claude Code，#354，分支 `feat/354-care-nail`）**剪指甲改照片特寫、雙手操作（第 2 份）**：`CatgameMini.tsx` 的剪指甲改開彈窗（`mini3d/NailGame2D.tsx`，不用 WebGL）。底圖是真實感的小貓腳掌照片（AI 合成，`public/play/nail/paw-tabby.webp`），指甲、血、指甲刀是疊在照片上的 SVG。
  - 玩法：一根手指按住趾肉球，那一根的指甲才伸出來（放開就縮回）；另一根手指拖指甲刀，放開＝剪。剪在白色尖端算剛好，太淺只算一半，剪到粉紅色血線會流血（血滴、畫面泛紅、尖叫與哈氣音效）。電腦：點一下肉球固定（再點一下放開）或按住空白鍵，滑鼠對準後按一下。
  - 規則：`lib/play/mini3d/nail-rules.ts`（`nailPress`、`nailClip`、`nailTick`、`nailResult`，有測試）；回傳 `{ score, bleed, bitten, ran }`。信任低、壓力高時不耐煩升得快（`nailDifficulty`），到 55 會抽腳，抽腳超過 3 次或不耐煩到 100 就咬人或跑掉。
  - 對位：`lib/play/mini3d/nail-paw.ts` 記四顆趾肉球、指甲根部與方向（viewBox 320×320）；**換照片要重量這張表**，同一張圖換解析度則照 `paw-tabby.license.txt` 的裁切比例就不用重量。
  - 目前只有虎斑一張，所有貓共用（Tina 2026-11-13 決定）。
  - 還沒做：真實 `/cats/[id]/play` 流程與實體手機實測；外出籠、貓抓板、穿模修正。細節見 `docs/daily/2026-11-13/1217-Tina-354.md`。

## 資料表（Supabase）
- ［已失效］`env_reports`、`virtual_sessions`、`virtual_tasks`（規劃名稱，改用下列 0017 的表）
- 領養任務：`meow_task_templates`（系統預設任務，依年齡層）、`meow_cat_task_sets`（中途草稿）、`meow_cat_task_versions`（存了就不改）
- 進行任務：`meow_task_runs`（進度、試養報告）、`meow_task_abandons`（放棄任務標籤，只有中途讀得到）
- 我的 3D 房間：`meow_room_models`（`owner_household_id`、`completed_at`、`raw_deleted_at`；`env_check` 11/04 起不再使用，之後的 migration 再移除）；私有 bucket `meow-home-videos`、`meow-home-scenes`
- 環境報告：`meow_env_reports`、`meow_env_report_shares`、`meow_env_report_advice`；Worker 的 `result.json`、`report.pdf`、裁切圖保存於私有 Azure Blob 容器（測試 `media-dev`／正式 `media`）的 attempt prefix，資料庫只存路徑。同一個喵戶可以有多份（檢測紀錄），單獨檢測的 `room_model_id` 為 null。

## API／主要函式
- 0017：`meow_save_cat_tasks()`、`meow_publish_cat()`、`meow_cat_publish_check()`、`meow_start_task_run()`、`meow_abandon_task_run()`、`meow_complete_task_run()`、`meow_share_task_proof()`、`meow_thread_task_status()`、`meow_finish_home_room()`、`meow_share_env_report()`
- 安全報告（#277，Draft）：`GET /api/homes/[id]/reports/[reportId]` 以使用者 session/RLS 驗證本人或已分享的中途，只回摘要、項目、同源裁切圖 URL 與本人專用的同源 PDF URL；`GET .../[reportId]/pdf` 與 `GET .../[reportId]/crops/[key]` 每次重新授權後 redirect 至短效 Blob URL。PDF 直送 Azure，不經 Vercel Function。Owner 頁面先顯示 PDF，再保留風險卡片；Keeper 僅顯示授權摘要／裁切圖。裁切圖載入失敗可重新請求同源路由。舊 queued 報告與 ready 報告並存時，已完成報告仍標示可查看。回傳格式與環境容器選擇見 `docs/spec/10_居家環境健檢Worker契約.md` §5.1。真實 Owner／Azure Preview 驗收仍待合法測試 session。
- Storage Adapter：`getMediaStore().readUrl()` 使用部署設定的單一 `AZURE_STORAGE_CONTAINER`；測試／Preview 應為 `media-dev`，正式為 `media`。不得自動跨容器 fallback。共用 Supabase 下，真實報告只可由指向 `media-dev` 且具有合法 owner session 的測試環境讀取。
- 待建立：環境影片風險偵測、情境劇本 AI 生成、任務 AI 摘要、Demo 加速模式

## #326 安全報告通知與佇列隔離

- 通知方案 A 在本 PR 新增 `0034_meow_env_notifications.sql`，**只在本機 PGlite 驗證，尚未部署**。`meow_env_jobs` 首次轉為 `done`／`failed` 時，由同交易的 `SECURITY DEFINER` trigger 建立通知；只用該 job 的 `report_id`、相同的 `household_id` 關聯 `meow_households.owner_id`。不讀取或修改分享資料。
- `meow_notifications.dedupe_key` nullable + partial unique index 作為去重：`env_job:<job UUID>:done|failed`。`queued`／`running`（含 requeued）不通知，job 狀態列鎖及 unique key 保護重複／併發終態呼叫；`already_done` 不會更新狀態。`claim` 判定 source 無效或租約耗盡而終結時也會通知。Worker RPC 簽章、回傳 JSON 與授權未改；匿名／authenticated 無權呼叫。
- 失敗通知內文直接由 `public.meow_env_user_error(new.error_code)` 產生，使影片、來源與系統錯誤使用既有契約文案；不讀取尚未更新的 report.error。既有 `/notifications` 頁使用通用 `title/body/link` 顯示，RLS 僅允許讀本人通知，無需增加新 UI／權限。3D 房間 Worker 現行做法位於 `workers/room-convert/pipeline/room_worker.py`：終結後透過 service-role REST 查 household owner 再直接 POST notification，沒有通知冪等鍵；本 PR 不更動該流程。
- **佇列隔離建議（等待子哲批准，未實作）**：在 `meow_env_jobs` 增加 nullable、受限的 `blob_container`（只允許 `media-dev`／`media`），新 `meow_create_home_processing` overload 由主站環境設定明確寫入；新 `meow_env_claim_scoped(worker, container)` 僅領取相同 `blob_container`。Worker claim 回傳維持 v05 現有 JSON 欄位與路徑格式；Worker 需有容器 allowlist，且核對傳入 scope 與實際 Azure client container 一致。舊 `meow_env_claim(worker)` 簽章保留但需改為 fail-closed（不領任何工作）；無 scope 舊 Job 先維持不可領取，盤點容器後另行核准回填。
- **部署順序**：先確認沒有舊版常駐 Worker，再合併 migration，子哲審 SQL 後手動部署；舊 claim 立即 fail-closed；接著部署會從 server env 選容器的主站版本與 scoped Worker。用兩筆新測試 job 驗證交叉拒領後，才可分別安排正式 Worker。這會要求 Worker 做最小 claim 協定更新，但不改 v05 的 job 輸出 schema。測試涵蓋 `media-dev` Worker 只領 dev、`media` Worker 只領 prod、錯誤／空 scope 不領取、舊 Job 隔離、輸出契約相容及 attempt/prefix 隔離。任何回填、`--once` 或常駐執行均需子哲同意；不覆寫／重跑既有 `a1`。

## 主要檔案
- 安全報告：`src/app/api/homes/[id]/reports/[reportId]/route.ts`、`pdf/route.ts`、`crops/[key]/route.ts`、`src/app/homes/[id]/safety/SafetyReportDetails.tsx`、`src/lib/home-safety/report-access.ts`
- `src/components/Sections.tsx`（`TrialBoard`、`Steps`）
- 虛擬飼養 DEMO（#237）：`src/app/cats/[id]/play/page.tsx`、`src/components/play/`（`PlayGame` 流程、`PlayStage` 3D、`ShopStep`、`NodeStep`、`ReportStep`、`catgame/` 原版小遊戲）、`src/lib/play/`（`flow.ts` 狀態機、`story.ts` 劇情、`events.ts` 意外、`furniture.ts` 通稱、`hazards.ts`、`costs.ts`、`room.ts`、`stage.ts`、`background.ts`、`lines.ts`、`report.ts`、`items.ts`、`cats.ts`、`api.ts`、`handlers.ts`）、`src/app/api/play/{hazards,lines,advice}/route.ts`、`src/lib/ai/play.ts`、`src/lib/prompts/play.ts`
- `requirement/catsafe_ar_README.md`（團隊 AR 模組草稿，未放入 repo）

## 決策
- 2026-10-31（子哲，決策 007）：居家環境原始影片與照片在 3D 場景和環境報告產出後立即刪除，只留風險裁切照；3D 場景只有領養人看得到；環境報告由領養人在私訊中主動分享給喵戶長；喵戶長可對每個風險項目寫建議。
- 環境報告（影片＋Vision）為核心，AR 為加分；iOS 降級為 3D 檢視。
- 虛擬試養綁定想領養的那隻貓；同時只能一隻。
- 2026-11-03（子哲，spec 09）：領養任務在飼主自己的 3D 房間進行；中途改任務時，正在做的人用開始時那版；放棄要選理由，放棄任務標籤只有該貓中途看得到；試養報告非申請必要條件但強烈建議。
- ［已失效，見 11-04］2026-11-03（子哲，spec 09）：環境檢查在上傳前詢問、按「完成」時再提醒；居家原始影像改成飼主按「完成」且報告產出後才刪（決策 007 待補充）。
- 2026-11-04（子哲，spec 09 v0.6）：建立 3D 房間簡化成三步，環境檢查一律同時做、不詢問；處理完（成功或失敗）立即刪除原始檔，回到決策 007；可單獨做居家安全檢測，多份報告留成檢測紀錄。

- 2026-11-06（渝茜，#237）：虛擬飼養 DEMO 縮成 3 個節點；居家意外整場只有一次、固定在節點 2，從 AI 辨認出而玩家沒處理的危險挑；遊戲狀態只放前端，不新增資料表；所有金額由 `src/lib/play/costs.ts` 公式算，AI 只寫文字。
- 2026-11-06（渝茜，#237）：劇情、居家意外、採買估價、小遊戲、試養報告照 catgame 原版；原版沒有、但 DEMO 需要的（AI 危險清單、模擬上傳、擺用品、個人化台詞）保留。
- 2026-11-06（渝茜，#237）：生活用品（餐碗組、貓砂盆）先用公開 bucket `meow-items` 的模型網址，尺寸與價格寫在 `src/lib/play/items.ts`；等子哲開放 `meow_items`／`meow_item_categories` 公開讀取後改讀後台（#237 已提醒）。

## 待確認
- 虛擬飼養改版（環境報告先行、跳過前兩關、小遊戲改 3D）：見上方「虛擬飼養改版待辦」，發起人渝茜。
- 影像生成方案。
- ［已處理，2026-11-06］虛擬飼養 DEMO 的劇情與小遊戲已改成照 catgame 原版。
- `meow_items` 是否開放公開讀取（子哲）；餐碗組路徑 `test_bowls_…` 是測試上傳，正式版換掉時 `items.ts` 也要改。
- 任務劇情已定為渝茜 #237 的 3 個節點（2026-11-06，子哲）；遊戲開始前的初始資料 API 見 #233。
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

| 2026-11-10 | Jerry0808 × Codex | PDF 下載連結改在新分頁執行，加入手機使用系統分享選單儲存的備案；Azure SAS 的 rscd 僅完成本機 SDK 驗證 | #337（Draft） |
| 2026-11-10 | Jerry0808 × Codex | 安全報告改為 HTML 摘要、風險項目與辨識限制優先；PDF 保留在內容後方供喵戶本人檢視／下載；頁面不再初載 PDF，也移除閱讀器樣式 | #337（Draft） |
| 2026-11-12 | 珮瑜 × Claude Code | 換水小遊戲改 3D 第一視角開水龍頭：兩隻手、水龍頭、六格動作時間軸（`mini3d/`、`lib/play/mini3d/`） | （還沒開 PR） |
| 2026-11-12 | 珮瑜 × Claude Code | 餵貓小遊戲改 3D：乾飼料顆粒、主食罐濕食、湯罐液體；餵貓、換水的彈窗關掉後貓才走到碗邊 | （還沒開 PR） |
| 2026-11-12 | 珮瑜 × Claude Code | 鏟屎小遊戲改 3D：拖曳貓砂鏟、連砂鏟起、左右甩掉砂、倒進垃圾袋；貓砂盆四款（只在彈窗裡） | （還沒開 PR） |
| 2026-11-13 | 珮瑜 × Claude Code | 驗收修正：餵貓一餐只餵一種（先選再倒、選完手先伸進來、罐頭可連開）；後台用品模型尺寸太小的不採用（貓砂盆 13 公分那筆） | （見 PR） |

## 虛擬飼養讀真實資料與試養報告給中途（/cats/[id]/play）
- 貓咪：`lib/play/source.ts` 的 `loadPlayCat(id)` 讀 `meow_cats`（名字、花色、生活階段、生日／估計月齡）＋ `meow_cat_model_variants.confirmed_albedo`（3D 貼圖）；讀不到才用 DEMO 麻糬。劇本裡的名字用 `〈貓名〉`（`furniture.ts` 的 `fullTx`）替換，小遊戲原版寫死的「麻糬」由 `CatgameMini` 畫完後換成貓名；非虎斑花色不畫條紋。
- 年紀：劇本時間軸不變，只把年紀換成這隻貓的實際月齡（`PlayState.startMonths`，節點年紀＝劇本年紀 − 2 個月 ＋ 實際月齡）；3D 體型 12 個月以下用幼貓、以上用成貓。標籤、小遊戲、報告「N 年」都用這個年紀。
- 喵戶：`components/play/usePlayData.ts`——登入者名下的一般飼主喵戶（多個可選）；預算 `meow_household_budgets` 自動帶入採買（可改）；3D 房間＝該喵戶最新完成的 `meow_room_models`（沒有才用公開示範房間，背景頁有「建立我家的 3D 房間」）；環境報告＝最新 ready 的 `meow_env_reports.items` → 居家危險（`player-data.ts` 的 `hazardsFromReport`，沒有才用物品清單＋規則）。
- 沒登入或沒有喵戶：帶去登入／建立喵戶（同 /run）。貓咪頁「進行領養任務」連 `/cats/[id]/play`（#273）；`/run` 頁保留。
- 試養報告給中途看（`0033_meow_play_report.sql`，**執行前須子哲確認**）：玩完報告頁自動呼叫 `meow_save_play_report` 存一筆已完成的 `meow_task_runs`（`game_report` 摘要由 `report-payload.ts` 產生：選擇、花費、照顧紀錄，不含家裡位置與裁切照）；領養人按「把試養報告附給中途」才呼叫 `meow_share_task_proof`；中途在對話串的 `TaskProof` 看到「系統認證」與可展開的試養報告（`meow_thread_task_status` 的 proof 多回 `game_report`）。示範貓、沒登入、放棄的體驗不存。
- 已知限制：劇情文字仍是固定劇本（成貓也會演結紮）；`/play` 不寫進行中的進度，只在玩完存一次。

### 時間軸、貓資料與版面（2026-11-10 晚）
- 年紀：劇本固定 2 個月到 15 歲，`timeline.ts` 換算成真實月齡；前半年照劇本，之後依剩餘時間壓縮，結尾最多 20 歲。節點名稱、獸醫台詞、報告年數、每月花費都用換算後的時間。
- 貓資料：`PlayCatSource` 多了 `sex`、`neutered`，經 `Life.cat` 進劇情；花色用 `coatNoun`，結紮節點見 `story.ts` 的 `spaySteps`。
- 版面：`place`、`node` 步驟時 `PlayGame` 的外框 `data-immersive="true"`，3D 房間 `position: fixed` 滿版，劇情卡放 `.sheet`（手機底部卡片，可收合）；小遊戲手機版從下方升起。

### 虛擬飼養：點 3D 物件、砂盆搬家、起始心情（2026-11-10）
- 在家的時光可直接點 3D 房間裡的貓／餐碗／貓砂盆開小遊戲（`RoomViewer` 的 `markers`），按鈕版保留。
- 第 3 天砂盆和碗分開／放一起會真的搬貓砂盆（`relocate` 步驟）。
- 劇情裡的餵飼料、鏟屎、刷牙、剪指甲會跳小遊戲彈窗。
- 起始信任／壓力由中途評論算（`startMood`）；沒有任何資料時用預設 30／40。

### #356 3D 刷牙與摸貓

- 摸貓反應使用成貓 GLB 的 `idle`、`cuddle`、`walk`。連續輕撫偏好部位才混入 `cuddle`，停手後回待機。煩躁達 55 混入 `head0` 的小幅轉向，降至 36 以下才解除；達既有離場門檻就停止計分，轉向後沿模型朝向走出畫面。減少動態模式保留靜態姿勢與衛教文字。

- Lv.0–4 首次有效接觸會暫停練習並播放一次可略過的轉頭衛教示範。定時掙扎時刷牙計分立即停止，照原規則判定咬人與跑掉，影片結束或播放失敗後顯示已定案的結果。開發環境可用 `meow:brush-struggle` 事件重現，操作見交接文件。

- 掙扎轉頭 POC 沿用既有掙扎規則，觸發時關閉特寫並釋放指標，反應期間停刷。內建的 540×720 H.264 MP4 在掙扎開始才載入，無法播放或設定減少動態效果時顯示閉嘴 WebP。

- 在家的時光與第 30 天劇情繼續呼叫 CatgameMini。刷牙與摸貓各由獨立原生彈窗載入，摸貓沿用 React Three Fiber，結束回傳原照護格式，取消回傳 null。
- 摸貓複製既有成貓母體 GLB，保留原有虎斑、眼睛、鬍鬚材質及 idle 動畫。Raycaster 命中隨骨架移動的頭、下巴、背、腹與尾部代理。尾根到尾端由六個代理覆蓋，背部和尾部深度接近時優先窄幅尾部，前方軀幹仍遮擋尾巴。計分沿用 touchFav、信任和壓力，材質與貼圖仍由共用 GLB 快取管理。
- 刷牙影像使用 `public/play/brush/brush-closed.webp`、`brush-lift.webp`、`brush-teeth.webp`，皆為 1086×1448；底圖固定，翻唇與露牙以局部遮罩疊合。三張圖以 eager 預載，必須全部載入才啟用操作，載入失敗顯示錯誤。觸控使用影像矩形的正規化座標，指套和牙刷分別對應四區與六區計分，沿用 brush-rules 的五階段、信任、壓力與原結果格式。手機分別追蹤撐嘴與刷具的 pointerId，桌面可按住空白鍵再拖曳。保留原 PNG 與 GLB 刷牙元件供回退及開發比較。
- 照護列、掃描房間需求氣泡與娃娃屋提示共用 CareIcon。RoomViewer 保留既有貓頭投影定位，只更換內容渲染。
- 翻唇拖動直接控制局部照片透明度；桌面可按住空白鍵並移動滑鼠，放手立即停止計分，照片逐步回到閉嘴。Lv.3–4 在固定全臉上方顯示約 2.36 倍口腔特寫，對準近似牙齦邊緣；五階段使用手指、牙膏手指、指套與軟毛牙刷。耐心、掙扎、咬人、跑掉與成功依原規則分別呈現。動作減量設定下，鍵盤開合省略過渡。視覺取捨與補件規格見 `docs/play-tasks/3-刷牙影像互動審查.md`。
- 實體手機、正式動畫／音效及帶背景房間的裝置效能留待驗收。
