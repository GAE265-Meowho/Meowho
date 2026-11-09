# HANDOFF — 接手的 agent 需要知道的事

> 寫給「完全沒有上下文的下一個 agent」。只保留**現在仍然成立**的內容。
> 最後更新：2026-11-09｜清俊 × Cursor（帶我回家地圖預覽，未開 PR）

## 目前狀態
- **帶我回家地圖（清俊 × Cursor，預覽中，不要開 PR）**：分支 `cursor/adopt-home-map-5901`，尚未建 Issue。首頁 `#adopt` 的「地圖」先選北／中／南／東（澎湖、金門、連江在「離島」），貓來自卡片同一份 `FeedCat`（`coat`、`city`、`area`、`tags`）。邏輯 `src/lib/adopt-map.ts`，畫面 `src/components/home/adopt/`。沒連資料庫時示意貓都在台中市，所以只有「中部」有 6 隻。舊等角小鎮 `src/lib/households.ts` 畫面已不引用。下一步：清俊看過預覽後才開 PR；想改地標、貓精靈或分區再改這一支。
- **#283 幼貓坐下重做（Tina × Claude Code）**：分支 `fix/283-kitten-sit-redo`。`base_clips_kitten.glb` 的 sit 對齊 `Meow/cat_base_kitten/work/preview/虎斑小貓360度旋轉動畫.gif`；坐姿參數集中在 `cat_base_kitten/stepC_clips.py` 開頭的 `SIT_*`。**合併後要上傳 Storage** `meow-cat-models/base/v1/base_clips_kitten.glb`。Meow 不是 git repo，腳本只在 Tina 電腦。
- **#259 平面圖轉換重複戶名（Tina × Cursor，已合併 #261）**：`0029_meow_room_floorplan_name_unique.sql`（既有重複改名不刪＋`source='floorplan'` partial unique index），INSERT 撞 index 回 `name_taken`。**0029 執行前須 Tina 確認**。
- **#237 newgame 版劇情（渝茜 × Claude Code，分支 `feat/237-newgame-story`，未開 PR）**：`story.ts` 改成 6 節點＋結尾，每節點後有「在家的時光」（`care.ts`），開場一定擺外出籠（`public/play/cat_carrier.glb`）；節點 5 居家意外讀居家安全清單，之後要換世安報告 API。設計稿在團隊專題 `newgame/`。
- **#237 虛擬飼養 DEMO（渝茜 × Claude Code，審查中）**：PR #244、分支 `feat/237-catgame-demo`。`/cats/[id]/play`（DEMO 固定麻糬、虎斑），流程與真的接上／備案對照見 `docs/modules/readiness.md`「虛擬飼養 DEMO」。邏輯在 `src/lib/play/`（純函式＋測試），畫面在 `src/components/play/`，AI 在 `/api/play/{hazards,lines,advice}`。
  - 要設的環境變數（Vercel，都是既有名稱）：`AZURE_OPENAI_ENDPOINT`、`AZURE_OPENAI_API_KEY`、`AZURE_OPENAI_CHAT_DEPLOYMENT_NAME=gpt-6-luna`（沒設＝全部走規則備案）；選填 `NEXT_PUBLIC_ROOM_DEMO_BASE`（掃描房間 manifest 資料夾，沒設＝自動改用娃娃屋）；喵戶讀取用既有的 `NEXT_PUBLIC_SUPABASE_*`。
  - **尚未實測**（沙盒連不到）：Azure 三支 AI、Supabase 讀喵戶 `home`、`meow-items` 遠端 GLB（沙盒看到的是替代方塊）、掃描房間 `RoomViewer`。合併前請在 PR 預覽網址走一次：登入有喵戶的帳號、設好 Azure，確認台詞與危險清單是 AI 版（API 回 `source: "ai"`）。
  - 生活用品先寫死在 `src/lib/play/items.ts`；子哲開放 `meow_items` 公開讀取後改讀後台。劇情、事件、採買估價、小遊戲、試養報告已照 catgame 原版（`story.ts` 的節點、`events.ts` 的 FEV、`costs.ts` 的 SHOP_ITEMS、`components/play/catgame/minis.ts`）；和原版的差異列在 PR #244 內文。
- **一般飼主建立喵戶＝試養遊戲的玩家背景（子哲 × Claude Code，#233，審查中）**：分支 `feat/233-household-budget-experience`。住家狀況、同住的人、現有寵物、養貓經驗、每月預算改必填；預算存 `meow_household_budgets`（`0025_meow_household_budget.sql`，子哲 2026-11-06 已在 SQL Editor 執行）。渝茜的遊戲（#237）要讀玩家背景時：住家資料讀 `meow_households.home`，預算用喵戶長本人的 session 讀 `meow_household_budgets`。
- **#239 成貓坐下（Tina × Cursor，已合併 #248／#254）**：成貓 `base_clips.glb` 含 sit；後腿修正已合併。Storage `base/v1/base_clips.glb` 已覆蓋。
- **#221 成貓 sleep 睡姿（Tina × Cursor，已合併 #236）**：`CatPreview` sleep 取景對齊貼地睡姿。
- **#226 MeowHQ Dashboard UI（Tina × Cursor，審查中）**：PR #227、分支 `ui/226-hq-dashboard-ui`（含 #224；舊 #225 已關閉）。卡片去來源／時間雜訊、頂部全域抓取時間、主數值放大。請 Tina **merge PR #227**。
- **#222 MeowHQ 首頁（Tina × Cursor）**：已合併 #223。移除「我最近的管理動作」；0023 未執行時不掃 Storage。
- **#218 MeowHQ KPI Dashboard（Tina × Cursor）**：已合併 #219。`/MeowHQ` 營運總覽；`GET /api/hq/dashboard`；`docs/hq/06_kpi-dashboard.md`。`0023_meow_dashboard_stats.sql` **尚未執行**（執行前須 Tina 確認）。付費貓咪欄位未啟用；Vercel Observability 未接時不顯示假數字。需 `SUPABASE_SERVICE_ROLE_KEY`。
- **#186 皇家食物元件（Tina × Codex）**：`/MeowHQ/assets?tab=food`，官方 sitemap 86 款、照片落地，分類與官方產品外連已接好。`src/lib/hq/food/` 共用目錄供之後虛擬購買；72 款有參考價、14 款待查。尚未接錢包／訂單／餵食庫存，未改 Supabase。參考價可用 `node scripts/update-food-reference-prices.mjs` 更新人工觀察值；完整官方再匯入用 `node scripts/import-royalcanin-food.mjs`（需網路）。
- **前台貓咪 3D 接 MeowHQ（#182 → #187 → #188 依序合併）**：#188 讓新增貓咪收側面／正面／背面、建立後自動跑 AI 三視角（需 Vercel 的 `SUPABASE_SERVICE_ROLE_KEY` 與 Azure 影像設定），前台貓咪頁可預覽；Step 03、04 仍在 MeowHQ 手動。下一步：三視角完成後通知 MeowHQ 管理員（之後改自動）。
- **MeowHQ 貓戶管理（#179，PR #180）**：新模組 `households`。`0020_meow_households_module.sql` **尚未執行**；執行前，系統管理員看得到頁面但只讀得到公開貓咪，其他管理員看不到選單。
- **前台「我的 3D 房間」接上房間模型 API（珮瑜接手，2026-11-04）**：現在 `/homes/[id]/scene` 和 `/homes/[id]/safety` 按下去都只建示範房間與示範報告（service role，`/api/homes/[id]/room`、`/api/homes/[id]/safety`）。要接的步驟、和後台 #93 不同的隱私規則（私有 bucket `meow-home-videos`／`meow-home-scenes`、原始檔處理完立即刪、成果不能放公開 bucket）、worker 要改的地方，全部寫在 `docs/modules/readiness.md`「給珮瑜：把房間模型 API 接到前台」。目標流程是 `docs/spec/09_領養任務目標流程規格.md` v0.6 §7.2。需要 Vercel 的 `SUPABASE_SERVICE_ROLE_KEY`（沒讀到時 API 回 503 `not_configured`）。
- `main` 上的首頁、頁首頁尾是 **meowwho-v2 新版 UI**（#65）；首頁「帶我回家」等區塊資料仍為示意（`src/lib/cats.ts`、`households.ts`）。尚未改版的內頁沿用舊元件樣式。
- 已接 Supabase（Auth、Postgres、Storage）與 AI（LangChain，`src/lib/ai/`，可切換 Gemini／OpenAI／Azure／Anthropic）的程式碼；**環境變數尚未設定時網站為「示範模式」**：可操作但不能登入、不儲存、AI 改用規則解析。設定步驟：`docs/setup/SUPABASE_LLM_SETUP.md`。
- 已完成：中途之家 onboarding（`/onboarding`）、我的貓戶（`/me`）、條款頁（`/legal`）。其他 `data-proto` 按鈕仍只跳提示。
- 一句話配對是**前端關鍵字規則**（`src/lib/match.ts`），是 RAG 的佔位；保留輸入輸出形狀，之後換實作。
- 正在進行的分支：`feat/33-onboarding-walkthrough`（Issue #33，待建立 PR）。
- 後台權限已改為「系統管理員按模組授權」（`docs/decisions/003-module-based-admin-authorization.md`，SRS v1.1 M15）；程式尚未跟上，現在任何 admin 都能授權他人（PLAN 任務 23）。名詞定義見根目錄 `GLOSSARY.md`。
- 後台：**MeowHQ `/MeowHQ`**（舊隱藏後台 `/mh-console-8k2p` 已移除，Tina 2026-10-29 決定）；第一位系統管理員需用 SQL 指定，見 `docs/setup/SUPABASE_LLM_SETUP.md` §7。
- 已部署：Vercel 專案 `zing15s-projects/meowho`（Hobby，帳號 ZING15），正式網址 https://meowho.vercel.app ，連動 `main` 自動部署，每個 PR 有預覽網址。`main` 須由 ZING15 以「Create a merge commit」合併，否則 Hobby 會擋部署。舊網址 meowhome.hsiangsolutions.com（Tina 的 `meow-home`）已不再更新。決策 005。

- **MeowHQ 後台開發中**（規格 `docs/hq/01～03`）：階段 0（T-HQ-01，Issue #18，分支 `feat/18-hq-contract`）已完成、PR 待 Tina 審查。內容：`src/lib/hq/types.ts`（模組代號、角色、處置類型、快選原因、錯誤代碼、側欄順序）＋測試，以及 `docs/modules/admin-moderation.md` 的 `0002_meow_hq.sql` 資料表草案。**`0002_meow_hq.sql` 檔案尚未建立、也沒有執行任何 SQL**（階段 1 的 db Issue 才寫檔）。**#18 合併前不要開始階段 1**；T-HQ-11 等 Issue #15（儲存位置）。待 Tina 決定的問題在 `PLAN.md`「建議」區的 MeowHQ 項目。

- **`0002_meow_hq.sql` 已在 Supabase 執行（2026-10-29）**：Tina 為 `system_admin`。SQL 測試已納入 `npm test`（PGlite）。
- **MeowHQ 階段 2**：#22 待辦總覽與列表元件已完成（`src/lib/hq/todos.ts`、`listing.ts`、`audit.ts`、`src/components/hq/list/`、`HqActor.tsx` 的 `useHqActor`／`HqModuleGuard`）；#23 Admin 授權、#24 用戶權限管理由 Claude 進行中。各模組頁用 `HqModuleGuard` 包住、`HqPageHeader` 做頁首、`useListQuery` 把篩選寫進網址。尚未開發的模組（檢舉、商品、知識、虛擬元件）顯示「模組開發中」。

- **#20（logic）已實作待審**（分支 `feat/20-hq-logic`）：`src/lib/hq/permissions.ts`、`actions.ts` 純函式；#21 shell、#22～#24 直接 import 使用，不要重複寫判斷。時間相關函式由呼叫端傳入 `now`。

- **MeowHQ 紋理貼圖確認（#129，分支 `feat/129-studio-detail-layout`）**：貓咪製作改 4 步，第 3 步紋理貼圖要「確認使用」才能進第 4 步。已確認路徑存 `meow_cat_models.profile.confirmed_albedo`；判斷一律用 `textureOf()`／`textureInfo()`（`src/lib/hq/cat-models/types.ts`），**貓咪頁不要再用 `hasAlbedo` 判斷能不能預覽**。產生紋理貼圖由 `paint_worker.py --supabase` 執行；**worker 程式已放進本 repo `workers/cat-paint/`**（#169），預定跑在珮瑜建立的 Azure VM（Ubuntu 24.04、T4），安裝見該資料夾 README；同時只能有一個 worker。
- **#104 成貓／幼貓變體（分支 `feat/104-adult-kitten-variants`）**：`0016_meow_cat_model_variants.sql` 及 `docs/hq/paint-worker-104.patch` 要與新版網站配套。Tina 電腦的 `Meow/cat_studio/paint_worker.py` 已套用補丁；搬到 Azure VM 時也要套同版。SQL **尚未執行**，須經 Tina 明確確認；worker 重啟且 SQL 套用後，才在 Vercel 設 `CAT_MODEL_VARIANTS_WORKER_READY=1`。預設為 0，網站維持單體型舊流程。補丁在 Meowho repo，可在 worker 目錄用 `git apply` 套用。`body_type` 決定生成母體，年齡只作舊任務預設；兩體型貼圖與上一版各自保存。
- **產生紋理貼圖前置條件（#135，分支 `fix/135-texture-needs-views`）**：三視角都成功才能產生，判斷一律用 `viewsReady()`（`src/lib/hq/cat-models/types.ts`）；`queuePaint`／`sbQueuePaint` 回 `views_required`（409）。舊貓沒有三視角的要先補產生。
- **平面圖轉換（#138，分支 `feat/138-floorplan-entry`，規格 `docs/hq/05`）**：PR 1 完成入口與上傳。一戶＝`meow_room_models` 一列（`source='floorplan'`），房間在 `meta.rooms`；原圖在 Azure Blob `floorplans/<戶>/<房間>`（決策 007 例外，見其補充）。邏輯在 `src/lib/hq/floorplans/`（`core.ts` 依賴注入、可測）。`0015_meow_room_floorplan.sql` 已於 2026-11-02 由子哲執行。Azure CORS 不允許 PR 預覽網址，上傳要在正式站或 localhost 測。**PR 3 AI 讀圖**（分支 `feat/138-floorplan-ai-read`）：上傳確認後 `after()` 自動讀圖，重新讀圖 `POST /api/hq/rooms/floorplan/read`；固定用 Azure 聊天部署（`AZURE_OPENAI_CHAT_DEPLOYMENT_NAME`），沒設定時房間停在「待讀圖」。整理與檢查在 `read.ts`，房間狀態判斷用 `canRead()`／`houseStatus()`。尚未用真實平面圖在正式站實測準確度。**#144（分支 `feat/144-floorplan-photos`）**：同一個上傳也收室內實景照片（AI 自動分辨），一間房最多 4 張（`photo_paths`，判斷用 `roomImages()`）；實景照片保留原圖是決策 007 的第二個例外。**步驟 4 3D 娃娃屋（分支 `feat/138-floorplan-viewer`）**：場景資料 `scene.ts`（純函式）、畫面 `FloorplanViewer.tsx`（next/dynamic，ssr: false）；不要用 drei 的 `Html` 做房名（React 19 開發模式會掉標籤）。家具是模型庫 glb（`public/hq-floorplan/furniture/`，由 `scripts/blender/furniture_kit.py` 產生，`kit.ts` 的尺寸要和 kit.json 一致）；靠牆家具由 `read.ts` 的 `snapToWall` 貼齊。
- **虛擬體驗（#150，分支 `feat/150-virtual-experience`）**：`/MeowHQ/assets?tab=experience`，`ExperienceTab.tsx` 選貓與喵戶，`FloorplanViewer` 的 `cat` 屬性放貓（`CatActor`，重用 `CatPreview` 匯出的 `CatModel`）；走路規則 `catwalk.ts`。跳上家具已完成（`catjump.ts`，不用 Rapier）；貓放大 1.2 倍、鏡頭跟著貓。下一步：遊戲玩法；母體補上 jump 動作後，`FloorplanViewer` 的 `CatActor` 跳躍中改播 jump。貓的外觀規則改在 `catLook.ts`（貓咪頁共用）。下一步：步驟 5 點房間進第一人稱＋放貓，用 `colliders()` 建 Rapier cuboid，沿用 `src/lib/hq/rooms/` 的 `RoomCat`／`RoomPhysics`。下一步：步驟 4 `FloorplanViewer`（JSON → 3D 娃娃屋）。
- **LLM 輸入防護（#38，決策 004）**：新增任何 LLM 任務，使用者內容必須經 `wrapUserInput()`、API 必須用 `checkInput()`（`src/lib/ai/guard.ts`）。問答模組上線時要實作「每段 20 輪、每天 50 次」。
- **`0003_meow_site_assets.sql` 已在 Supabase 執行（2026-10-29，`meow_0003_site_assets`）**：Logo 上傳與網站設定可用，待 Tina 登入實測。

- **設計系統 v2（PLAN 任務 28，PR #54 已合併）**：`docs/design/DESIGN.md` 為 v2（溫暖平面），Cozy Cat Nook 封存在 `docs/design/archive/`。動到任何前台畫面前先讀 DESIGN.md。`globals.css` 已有 v2 token（#65）；既有頁面暫時沿用 `.btn`，只遷移各 Issue 動到的元件。
- **首頁改用 meowwho-v2 新版 UI**（Issue #64，分支 `feat/64-meowho-v2-ui`，2026-10-31 子哲 × Claude）：新元件在 `src/components/{home,journey,layout,ui}/`，只用 `globals.css` 的 v2 token（`--paper`、`--ink`、`--caramel`…）；舊 token（`--cocoa`、`--peach`…）在 `template.css` 對應到 v2，留給尚未改版的內頁與後台。按鈕用 `CatButton`，不要在新元件用 `.btn`。

- **#57／#72 建檔對話引擎（分支 `feat/57-household-cat-profile`）**：`src/lib/onboarding/conversation.ts`（純邏輯）＋ `src/lib/ai/intake.ts`（LLM 鏈），已有測試，**尚未接畫面**；`/onboarding` 目前仍是舊的一問一答流程。migration 0004 已寫好（**尚未執行，要跟新版 `/onboarding` 一起上線**，舊流程不送年齡層會建貓失敗）。儲存介面 `src/lib/storage/`（Azure 版＋記憶體版）與影片判讀已完成；Azure 儲存帳號尚未建立（設定文件第 8 節）。下一步：畫面。

- **房間影片轉換（#93，#177／#178 已合；#161／#198 審查中）**：已上線，`0014` 已執行。worker 正本在 `workers/room-convert`（目前珮瑜 Mac 跑）；後台成果公開 bucket、前台我的 3D 房間的影片 2026-11-07 起放 Azure `homes/<喵戶>/videos/…`（#273，`/api/homes/[id]/videos` 簽網址），成果放私有 `meow-home-scenes` 並通知喵戶長；worker 不刪影片（#242）。worker 要在 `.env.worker` 設 `AZURE_STORAGE_*`。列表進度用 `roomStage`／`STAGE_KEYWORDS`；備註與縮圖在 `meta`。本機測試設 `ROOM_LOCAL_ROOT`、`NEXT_PUBLIC_ROOM_LOCAL=1`。
## 下一步（建議第一個動作）
0. Issue #33：程式與四項檢查已完成，待建立 PR；正式站 `/onboarding` 停在「載入中…」，未完成登入後實際流程，PR 需保留此限制。
1. #18 合併後，平行開工階段 1：#19（db）、#20（logic）、#21（shell）；階段 2 為 #22（lists-home）、#23（admin-auth）、#24（users），等階段 1 合併後開始。Issue 都已建立，不用再建。
2. 正式環境已設定完成（2026-10-30，`docs/setup/SUPABASE_LLM_SETUP.md`）：Supabase、Google 登入、Gemini、Vercel 環境變數。新專案的第一位系統管理員由子哲用 SQL 指定（§7）。
3. 下一個任務建議：貓咪公開頁、首頁「帶我回家」改讀真實資料（任務 3）、領養人 onboarding（任務 7）。
3. PLAN.md 其餘任務的 Issue 尚未建立。

## 地雷與注意
- **照片**：來自 Google Stitch 設計稿的外部網址（`src/lib/photo-urls.json`），可能失效。展示前執行 `npm run photos:download`，並設 `NEXT_PUBLIC_LOCAL_PHOTOS=1`。雲端 agent 的環境可能連不到這些網址，截圖驗證時看到空白屬正常。
- **字型**：從 Google Fonts 以 `<link>` 載入（Quicksand、Zen Maru Gothic、Noto Sans TC）；離線時退回系統字。
- **管理者標誌設定**：目前存 localStorage；任務 17 會改存資料庫，不要更換 `public/logos/` 的檔案。
- **Vercel Hobby＋private repo**：非帳號擁有者的 commit 會被擋下部署（見 CONTRIBUTING §8）。
- **GitHub Free private repo**：branch protection 不會強制生效，main 只能靠流程自律。
- `npm install` 若遇到 peer 相依錯誤，測試套件版本已固定在 vitest@3、@vitejs/plugin-react@4，不要升級到最新主版本。

- **Supabase 是獨立專案 `onebpkbkrnnwamwsoelo`**（2026-10-30 起，決策 005；舊共用專案 `pnnehddxeujxghhnnqrv` 不再使用）：資料表、函式、policy 仍一律 `meow_` 開頭，bucket `meow-cat-photos`。**不要動非 `meow_` 開頭的物件、不要在 `auth.users` 加 trigger；Site URL 固定 `https://meowho.vercel.app`**。完整規範：`AGENTS.md` §7。
- **Supabase migration** 由 AI 透過 Supabase 連接器執行，執行前須經發起人確認（AGENTS.md §7.4）；新專案已執行 `0001`～`0003`。
- **Google 登入**：Supabase Site URL＝`https://meowho.vercel.app`，Redirect URLs 含 `https://meowho.vercel.app/**`、`https://*-zing15s-projects.vercel.app/**`、`http://localhost:3000/**`；Google OAuth 在「測試中」，新組員要先加進 Google Cloud `meowho` 的測試使用者。

- **MeowHQ shell（#21）**：外殼在 `src/app/MeowHQ/`＋`src/components/hq/`。舊後台已移除（功能移到 #23 管理員授權與網站外觀、#24 中途認證）。`src/components/hq/access.ts` 的 `visibleSidebar` 讀不到授權表時會退回「全部可見」，0002 執行後由 #22 改接 `permissions.ts` 並移除退回邏輯。`Auth.tsx` 的 `isAdmin` 為 admin 或 system_admin（`src/lib/auth-role.ts`）。本機未設 Supabase 時用 `/MeowHQ?hqPreview=1` 預覽外殼（僅非 production）。

- **虛擬體驗元件管理—貓咪模型（#75，分支 `feat/75-assets-cat-models`，2026-10-31 Tina × Cursor）**：規格 `docs/hq/04_assets-cat-models規格書.md`。PR 2a、2b 已完成：`/MeowHQ/assets` 四分頁、貓咪列表、新增貓咪 `/cats/new`、貓咪頁（`CatPreview` 3D 預覽、動作清單、上下架）、貼圖工作頁 `/cats/<id>/studio`（產生選項、進度、貼圖結果、改用上一版；由 `paint_worker.py` 實際上色，要另外開）。資料來源目前只有「本機檔案」（讀 Cat Studio 的 `adoption_cats/`，需在 `.env.local` 設 `CAT_STUDIO_ROOT`，只在 `npm run dev` 有效）。**下一步**：PR 3 才寫 `0004_meow_cat_models.sql`（**執行前須經 Tina 確認**）。預覽本機無 Supabase 設定時才能用 `?hqPreview=1`；有 `.env.local` 時請暫時建 `.env.development.local` 清空兩個 `NEXT_PUBLIC_SUPABASE_*`。本機驗證前先 `Remove-Item Env:CAT_STUDIO_ROOT`（shell 殘留的環境變數優先於 `.env`，曾因此寫進真實的 Cat Studio 資料夾），建議指到暫存資料夾驗證。母體 glb 的名稱約定（材質 `cat_fur`／`cat_eye`、形狀鍵 `blink_L`／`blink_R`、動作 `idle`／`walk`／`sleep`）不能改，改了預覽會壞。
- **貓咪模型線上產生（#88，分支 `feat/88-cat-model-upload`，2026-11-01 Tina × Claude Code）**：正式站（Supabase）可新增貓咪、上傳照片、產生貼圖、換回上一版。照片由瀏覽器直傳 Storage（`/api/hq/cat-models/upload` 只簽網址）。**產生要靠 Tina 電腦上的 worker**：在 `Meow` 目錄執行 `C:\AI\Hunyuan3D-2\venv\Scripts\python.exe cat_studio\paint_worker.py --supabase`（金鑰讀 MeowHome `.env.local`），沒開任務會一直排隊。母體依 `base_version`／年齡選成貓或幼貓（`bodyFor`）；Storage 的 `meow-cat-models/base/v1/` 目前只有成貓 `base_clips.glb`，幼貓退回 `public/hq-cat-models/base/base_clips_kitten.glb`。0005 已在新專案套用（`meow_cat_models` 有 bb 一筆，`base_version='v1'`）。`docs/modules/admin-moderation.md` 第 15009 位元組有一個 NUL 字元（舊的），git 會把它當二進位檔。
- **AI 三視角照片（#110，分支 `feat/110-ai-cat-views`，#107 已決定不做並關閉（讀取其他角度照片的部分保留在本分支），2026-11-02 Tina × Claude Code）**：`POST /api/hq/cat-models/<id>/views` 用 `after()` 背景產生（`maxDuration=300`），狀態在 `profile.generated`，工作區輪詢。模型：影像 `AZURE_OPENAI_IMAGE_DEPLOYMENT=gpt-image-2`、年齡判斷（聊天，固定用 Azure、不受 `AI_PROVIDER` 影響）`AZURE_OPENAI_CHAT_DEPLOYMENT_NAME=gpt-6-luna`（`gpt-6-luna` 不能產圖）；2026-11-02 已用 `ai_views_demo.py` 實測可產生，網站端尚未在 Vercel 實測。Vercel 要加 `AZURE_OPENAI_ENDPOINT`（v1 網址）、`AZURE_OPENAI_API_KEY`、`AZURE_OPENAI_IMAGE_DEPLOYMENT`、`AZURE_OPENAI_CHAT_DEPLOYMENT_NAME`。Vercel 方案的函式時間上限若低於產生時間，三張會被標成逾時（6 分鐘後）。
- **新增貓咪頁整理（#120，PR #121 已合併）**：已移除成貓／幼貓拍攝樣品照，主照片與其他角度 2、3 改為桌面三欄、手機單欄；性別（公／母）寫入本機 `profile.json` 與 Supabase `profile`，重新讀取時回到 `CatModelView`。原有照片持久化與失敗後保留重試流程未改動。
- **MeowHQ 貓咪工作室版面（#123，分支 `feat/123-studio-layout`）**：桌面固定左右雙欄；左側「虛擬貓咪檔案」含貓咪資訊、上傳照片、AI 三視角與貼圖；右側放產生選項和任務進度。手機改上下排列並可收合左側；新增貓咪頁名稱與性別同列。正在準備 PR；不部署正式環境。
- **3D 編輯器工作區（#96，分支 `feat/96-editor-workspace`，2026-11-01 Tina × Claude Code）**：`BaseLab`、`CatPage` 的預覽在 `<section aria-label="3D 預覽">`、參數在 `<section aria-label="參數">`（`PanelGroup` 分組）。版面全靠 `hq.css` 的 `.hq-catpage`（桌機用 `.hq-main:has(> .hq-catpage)` 撐滿視窗高度，≤1023px 上下排列）；**不要用條件渲染切換手機版**，`CatPreview` 換位置會重建 Canvas。
## 重要檔案
| 檔案 | 用途 |
|---|---|
| `AGENTS.md` | 共同規範 |
| `docs/agents/PLAN.md` | 任務與排程 |
| `docs/modules/*.md` | 各大模組現況 |
| `docs/daily/` | 每日紀錄 |
| `docs/spec/01_系統需求規格書_SRS.md` | 需求 |
| `docs/design/DESIGN.md` | 設計系統 |

- **#23 Admin 授權（2026-10-29，Claude）**：`/MeowHQ/admin` 已完成，分支 `feat/23-hq-admin-auth`。`0003_meow_site_assets.sql` **尚未在 Supabase 執行**，執行前上傳 Logo、儲存網站設定會失敗。Logo 寫入只能走 `meow_set_site_setting`，前端用 `useUi().applyLogo` 立即套用。

- **#24 用戶權限管理（審查中，分支 `feat/24-hq-users`）**：`/MeowHQ/users` 帳號＋中途認證兩分頁；資料庫函式呼叫統一走 `src/components/hq/users/useHqRpc.ts`（成功 toast 帶「查看紀錄」、`permission_denied` 回待辦總覽）。其他模組可重用。
