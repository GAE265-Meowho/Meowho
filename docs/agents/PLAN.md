# PLAN — 計畫與任務管理

> GitHub Issues 是任務的正式來源；本檔是給 agent 快速掌握全局的鏡像與排程。
> 狀態只用：`待辦`、`進行中`、`審查中`、`完成`、`卡住`。開工改「進行中」並填負責人，收工更新。
> 最後更新：2026-11-11｜Jerry0808 × Codex（#327 合併衝突與通知文案修正）；清俊 × Cursor（帶我回家地圖，PR #315）；Jerry0808 × Codex（#273）

## 里程碑

| 日期 | 檢查點 | 範圍 |
|---|---|---|
| 10/30 | 題目確認 | 範圍、架構、分工 |
| 11/05 | 高風險確認 | AR 實機、影像生成一致性、影片管線、皇家官網爬取 |
| 11/12 | P1 可運行 | 任務 1–11 |
| 11/18 | 執行追蹤 | Code Review、P1 Demo |
| 11/22 | P2 完成 | 任務 12–17 |
| 11/24 | 部署＋彩排 | E2E、Demo 影片 |
| 11/26 | 成果報告 | — |

## 任務（tracer-bullet，每張可獨立 Demo）

- 站台標誌換成向量「門口貓頭款」並統一前後台（#361，子哲 × Claude Code，2026-11-11）：審查中；分支 `feat/361-door-cat-logo`。合併部署後要到 MeowHQ 設定選「門口貓頭款」（正式站目前存 `house`）。
- WelfareLens 安全報告通知／佇列隔離設計（#326，Jerry0808 × Codex，2026-11-11）：PR #327 已整合最新 main，`0034` 通知文案依 `new.error_code` 產生；PGlite、完整測試與 build 通過，Draft PR 待組長 Review；禁止自行部署。佇列採 job container scope + scoped claim 的建議待批准，尚未實作。
- 帶我回家地圖（清俊 × Cursor，2026-11-10）：審查中（新竹縣左下、台中右上、屏東在泰武右側、嘉義市不標東／西；台北基隆台南高雄重疊區名依面積縮小。**尚未建 Issue**）。分支 `cursor/adopt-home-map-5901`，PR #315。
- WelfareLens 安全報告讀取 API＋PDF-first 評估頁（#273 C＋D，Jerry0808 × Codex）：進行中；沿用 Draft PR #277／`feat/273-env-report-view`。離線授權與 UI 測試已補；main 合併衝突已在 PR 分支解決；build 已 PASS；Preview 未登入 API/PDF/crop 拒絕驗收 PASS；Owner session 與 Supabase/Azure 設定核驗、手機顯示仍 BLOCKED。
- 虛擬飼養讀真實資料＋試養報告給中途看（渝茜 × Claude Code，2026-11-10）：審查中；分支 `feat/play-real-data`。貓咪／喵戶／預算／3D 房間／環境報告讀真實資料，玩完報告存 `meow_task_runs.game_report`（`0033`，執行前須子哲確認），中途在對話串看。
- 虛擬飼養 DEMO（#237，渝茜 × Claude Code，2026-11-06）：審查中；PR #244、分支 `feat/237-catgame-demo`。`/cats/[id]/play` 3 個節點、AI 危險／台詞／建議（規則備案）、採買花費、3D 娃娃屋擺用品、小遊戲、試養報告；Azure／喵戶讀取／遠端 GLB／掃描房間未在沙盒實測。
- 跳躍腰部摺痕、成貓從櫃子往下跳重新規劃（#300，Tina × Claude Code，2026-11-09）：審查中；分支 `fix/300-jump-waist-fold`。合併後成貓 glb 要再上傳 Storage。
- 母體 glb 快取版本號、沒有跳躍 C 不畫櫃子（#298，Tina × Claude Code，2026-11-09）：完成（PR #299 已合併）。
- 成貓新增跳躍 A、B、C（#295，Tina × Claude Code，2026-11-09）：完成（PR #296 已合併；Tina 11:33 已上傳 Storage 成貓檔）。
- 幼貓新增從櫃子往下跳（#293，Tina × Claude Code，2026-11-09）：完成（PR #294 已合併）。
- 跳躍 B 加往前位移、跳躍預覽鏡頭拉遠（#291，Tina × Claude Code，2026-11-08）：完成（PR #292 已合併）。
- 貓咪頁預覽改正方形、紋理移到預覽下方（#289，Tina × Claude Code，2026-11-08）：完成（PR #290 已合併）。
- 幼貓新增跳躍（#287，Tina × Claude Code，2026-11-08）：完成（PR #288 已合併）。幼貓母體多 `jump_a`（跳躍-(下往上跳) A）、`jump_b`（跳躍-(往前跳) B），動作庫兩個都 ready。
- 貓咪清單載入很慢（#285，Tina × Claude Code，2026-11-08）：完成（PR #286 已合併；清單 13.5 秒 → 2～3 秒）；分支 `fix/285-cat-list-slow`。`sbListCats` 的自動採用／排程改到 `after()` 背景執行。
- 幼貓坐下重做（#283，Tina × Claude Code，2026-11-08）：完成（PR #284 已合併；Storage 沒有幼貓檔，直接用 repo 版）；分支 `fix/283-kitten-sit-redo`。對齊 360° 驗收 GIF，換 `base_clips_kitten.glb`；合併後上傳 Storage 幼貓 GLB。
- 幼貓新增「坐下」動作（#239，Tina × Cursor，2026-11-06）：完成（PR #268 已合併，坐姿由 #283 重做）；分支 `feat/239-kitten-sit-clip`。幼貓母體含 sit；預覽瞳孔 0.67；合併後上傳 Storage 幼貓 GLB。
- 成貓新增「坐下」動作（#239，Tina × Cursor，2026-11-06）：完成；PR #248／#254 已合併、Storage 已更新。`clip_sit` 端坐＋後腿貼地。
- 成貓 sleep 睡姿更新（#221，Tina × Cursor，2026-11-06）：完成；PR #236 已合併、分支 `fix/221-adult-sleep-clip`。bundled 成貓母體 `base_clips.glb` 換成 cat_base 最新 sleep；幼貓不動；`CatPreview` sleep 取景。
- MeowHQ Dashboard UI/UX 優化（#226，Tina × Cursor，2026-11-05）：審查中；PR #227、分支 `ui/226-hq-dashboard-ui`（併含 #224）。
- MeowHQ 首頁不要自動一直重新整理（#224，Tina × Cursor，2026-11-05）：併入 PR #227；舊 PR #225 已關閉。
- MeowHQ 首頁修閃爍＋移除最近管理動作（#222，Tina × Cursor，2026-11-05）：完成；PR #223 已合併。
- MeowHQ KPI Dashboard（#218，Tina × Cursor，2026-11-05）：完成；PR #219 已合併。首頁營運總覽＋`/api/hq/dashboard`；0023 待執行；付費貓咪／Vercel Observability 尚未啟用。
- 新增貓咪三個角度上傳按鈕（#195，Tina × Claude Code，2026-11-04）：審查中；分支 `fix/195-angle-upload-buttons`。
- 皇家食物元件（#186，Tina × Codex，2026-11-04）：審查中；分支 `feat/186-royalcanin-food-catalog`。台灣官方 sitemap 86 款、照片與交叉分類完成，72 款參考價、14 款待查；詳細資訊官方外連。尚需正式字型建置／人工視覺驗證，購買流程另做。

| # | 任務 | 模組文件 | 前置 | 期別 | Issue | 負責 | 狀態 |
|---|---|---|---|---|---|---|---|
| 273 | WelfareLens 安全報告讀取 API＋PDF-first 評估頁（C＋D；既有 Draft PR #277） | readiness | #263、#274 | P1 | #273 | Jerry0808 | 進行中 |
| 0 | 首頁原型（Next.js、設計系統、管理者標誌設定） | matching | — | P0 | — | Tina | 完成 |
| 1 | Supabase、Google 登入、條款同意 | account | — | P1 | #1 | Tina | 審查中 |
| 2 | 建立貓戶、新增貓咪、我的貓戶（貓咪公開頁待做） | household-cats | 1 | P1 | #1 | Tina | 審查中 |
| 3 | 首頁帶我回家與統計改讀真實資料 | matching | 2 | P1 | 待建立 | B | 待辦 |
| 4 | 寫日記：照片上傳、公開／私密、時間軸 | household-cats | 2 | P1 | 待建立 | B | 待辦 |
| 5 | 動態牆：按讚、留言、追蹤、分享預覽 | social | 4 | P1 | 待建立 | B、C | 待辦 |
| 6 | AI 建檔：拍照＋對話問答、自由口述（中途之家 onboarding） | ai-onboarding | 2 | P1 | #1 | Tina | 審查中 |
| 7 | 領養人 onboarding（文字＋語音） | ai-onboarding | 1 | P1 | 待建立 | D | 待辦 |
| 93 | MeowHQ 室內空間：影片轉 3D 房間與貓咪互動 | admin-moderation | — | P1 | #93 | 珮瑜 | 審查中 |
| 159 | MeowHQ 貓咪製作：已建立的貓咪模型列表改版 | admin-moderation | — | P2 | #159 | Tina | 審查中 |
| 258 | MeowHQ 貓咪製作：流程圖收合、操作按鈕區塊與貓咪模型欄位調整 | admin-moderation | 23-9 | P2 | #258 | Tina × Codex | 審查中 |
| 33 | 真實走查並修正中途之家 onboarding | ai-onboarding、household-cats | 2、6 | P1 | #33 | Tina × Codex | 審查中 |
| 161 | 領養任務目標流程規格（spec 09）與資料庫（0017，已執行） | readiness、adoption、household-cats | — | P1 | #161 | 子哲 | 審查中 |
| 8 | 一句話 RAG 配對（取代關鍵字原型） | matching | 3、7 | P1 | 待建立 | E | 待辦 |
| 9 | 私訊＋站內通知鈴鐺（通知基本版已完成於 #3） | social | 1 | P1 | 待建立 | C | 待辦 |
| 10 | 領養設定、提出申請、審核流程（含多人申請） | adoption | 2、7、9 | P1 | 待建立 | C | 待辦 |
| 11 | 移轉、14 天試養、時間軸分段 | adoption | 10 | P1 | 待建立 | C | 待辦 |
| 12 | 照片影片轉文字、每週週報 | ai-media-weekly | 4 | P2 | 待建立 | E | 待辦 |
| 13 | 居家環境影片 AI 風險報告 | readiness | 7 | P2 | 待建立 | F | 待辦 |
| 14 | 7 天虛擬試養（劇本、評分、摘要、加速模式）；DEMO 版見 #237 | readiness | 2、12 | P2 | 待建立 | D、F | 待辦 |
| 15 | 知識庫、皇家飼料資料庫、首年花費（含後台維護） | knowledge-commerce | 1 | P2 | 待建立 | D、A | 待辦 |
| 16 | 導購追蹤連結＋成效儀表板 | knowledge-commerce | 15 | P2 | 待建立 | A、B | 待辦 |
| 17 | 後台：標誌設定存資料庫、中途認證、管理員授權（檢舉、內容審核待做） | admin-moderation | 1 | P2 | #3 | Tina | 審查中 |
| 18 | AR 3D 貓 | readiness | 13 | P3 | 待建立 | F | 待辦 |
| 19 | 雙向評分（不公開）與申訴 | adoption | 11 | P3 | 待建立 | C | 待辦 |
| 20 | 退養流程 | adoption | 11 | P3 | 待建立 | C | 卡住（需求待確認） |
| 21 | AI 層改用 LangChain，可切換模型 | ai-onboarding | 1 | P1 | #11 | Tina | 完成 |
| 22 | SRS v1.1（後台按模組授權，決策 003）、名詞表、任務清單狀態更新、改名 Meow Home | admin-moderation | — | P0 | — | Tina | 審查中 |
| 24 | 首次登入條款：看完才能勾選同意 | account | 1 | P1 | #16 | Tina | 審查中 |
| 23 | 後台改為按模組授權：系統管理員、模組授權、稽核日誌、停權／黑名單、虛擬體驗元件管理（T-15-06～09）。拆為 MeowHQ 階段（見 `docs/hq/03`） | admin-moderation | 17、22 | P2 | 見下列 | C、B | 進行中 |
| 23-0 | MeowHQ 階段 0：共用約定型別（T-HQ-01）＋0002 資料表草案 | admin-moderation | — | P2 | #18 | Tina × Cursor | 審查中 |
| 23-1 | MeowHQ 階段 1：db（T-HQ-02、12）、logic（T-HQ-03、04）、shell（T-HQ-05、06） | admin-moderation | 23-0 | P2 | #19 db、#20 logic、#21 shell | C、B、Claude | 完成（0002 已執行） |
| 23-2 | MeowHQ 階段 2：待辦總覽與列表、Admin 授權、用戶權限管理（T-HQ-07～10） | admin-moderation | 23-1 | P2 | #22 lists-home、#23 admin-auth、#24 users | Claude | 完成（#22、#23、#24 已合併；0003 已執行，待 Tina 登入實測） |
| 25 | LLM 輸入防護：服務範圍、prompt injection、字數上限（決策 004） | ai-onboarding | 21 | P1 | #38 | Tina × Claude | 審查中 |
| 26 | 品牌改名 Meowho喵戶、換新 Logo（三張）、前台新樣板 | matching | — | P1 | #42 | Tina × Claude | 進行中（改名與 Logo 完成；樣板第一批＝色票／按鈕／入口卡／頁尾已上，區塊版型細改待續） |
| 27 | 喵戶小區（示意資料）＋貓咪走到新家動畫 | matching | 26 | P1 | #44 | Tina × Claude | 進行中（小區完成；動畫等 Tina 用 WhoMeow 3D 流程提供素材，儲存位置見 #15） |
| 23-3 | MeowHQ 階段 3：虛擬體驗元件管理—貓咪模型（T-HQ-11）、獨立審查（T-HQ-13） | admin-moderation | 23-2 | P2 | #75 | Tina × Cursor | 進行中（儲存位置已定 Supabase Storage；PR 2a 貓咪列表／貓咪頁／預覽、2b 新增與貼圖工作頁已完成審查中（同一個 PR），之後 3 migration、4 worker、5 動作庫） |
| 23-4 | MeowHQ 貓咪模型：線上上傳照片產生 3D（Supabase 新增／產生／換版、本機 worker `--supabase`、成貓／幼貓母體） | admin-moderation | 23-3 | P2 | #88 | Tina × Claude Code | 審查中（主功能 PR #90 已合併；貓咪分頁版面整理 PR 審查中） |
| 23-5 | MeowHQ 體型骨架：幼貓脖子錯位修正、下載 GLB | admin-moderation | 23-4 | P2 | #91 | Tina × Claude Code | 審查中 |
| 23-6 | MeowHQ 3D 編輯器版面：預覽固定、參數面板獨立捲動 | admin-moderation | 23-5 | P2 | #96 | Tina × Claude Code | 完成（#97 已合併） |
| 23-7 | MeowHQ 新增貓咪頁：成貓／幼貓拍攝範例照 | admin-moderation | 23-4 | P2 | #98 | Tina × Claude Code | 完成（#99 已合併） |
| 23-8 | MeowHQ 體型骨架卡片各半、移除貓咪上架／下架、後台版面原則 | admin-moderation | 23-7 | P2 | #100 | Tina × Claude Code | 完成（#101 已合併） |
| 23-9 | MeowHQ 貓咪模型列表欄位調整、移除殘留的上架狀態 | admin-moderation | 23-8 | P2 | #102 | Tina × Claude Code | 完成（#103 已合併） |
| 23-10 | MeowHQ 新增貓咪頁兩欄版面、正面／背部花紋照片上傳 | admin-moderation | 23-9 | P2 | #105 | Tina × Claude Code | 完成（#106 已合併） |
| 23-12 | ~~MeowHQ 貓咪頁補傳正面／背部花紋照片~~（2026-11-02 Tina 決定不做：其他角度照片改在新增貓咪一起上傳；讀取部分併入 #110） | admin-moderation | 23-10 | P2 | #107 | Tina × Claude Code | 完成 |
| 23-13 | MeowHQ AI 三視角照片（第一階段）、貼圖工作頁改名製作glb工作區；新增貓咪頁依 Stitch 改兩步驟、體型骨架預覽獨立一頁 | admin-moderation | 23-10 | P2 | #110 | Tina × Claude Code | 完成（#111 已合併） |
| 23-14 | MeowHQ 左側選單改成 Stitch 分組＋圖示樣式；虛擬體驗元件管理區塊移到左側子選單 | admin-moderation | — | P2 | #113 | Tina × Claude Code | 完成（#114 已合併） |
| 23-17 | MeowHQ 體型預覽新增奔跑貓（低多邊形橘白虎斑、奔跑動作） | admin-moderation | 23-16 | P3 | #331 | Tina × Claude Code | 完成 |
| 23-16 | MeowHQ 還沒有 3D 的貓直接進製作glb工作區；列表動作數改進度欄；工作區顯示其他角度照片 2、3 | admin-moderation | 23-13 | P2 | #118 | Tina × Claude Code | 審查中 |
| 23-17 | MeowHQ 新增貓咪頁移除樣品照、三張照片同列、加入性別並保留照片與資料 | admin-moderation | 23-13 | P2 | #120 | Tina × Codex | 完成（#121 已合併） |
| 23-18 | MeowHQ 工作室左右分區、手機可收合虛擬貓咪檔案；新增貓咪名稱與性別同列 | admin-moderation | 23-17 | P2 | #123 | Tina × Codex | 審查中（待 PR） |
| 23-19 | MeowHQ 貓咪工作室與貓咪頁版面整理；流程改 4 步、紋理貼圖人工確認 | admin-moderation | 23-18 | P2 | #129 | Tina × Claude Code | 審查中（PR #131） |
| 23-20 | MeowHQ 尚未產生 AI 三視角時不能產生紋理貼圖（前端停用＋API 檢查） | admin-moderation | 23-19 | P2 | #135 | Tina × Claude Code | 完成（#137 已合併） |
| 23-21 | MeowHQ 平面圖轉換 PR 1：一戶清單、上傳房間平面圖（Azure Blob）、原圖預覽；後續 AI 讀圖、3D、放貓、線框修正 | admin-moderation | — | P2 | #138 | Tina × Claude Code | 進行中（上傳、AI 讀圖、實景照片、3D 娃娃屋完成；家具模型庫與貼牆擺放審查中） |
| 23-21b | 平面圖戶名並發重複：partial unique index＋23505→name_taken；既有重複改名不刪 | admin-moderation | 23-21 | P2 | #259 | Tina × Cursor | 進行中（分支 fix/259-floorplan-unique-name；0029 待 Tina 確認後執行） |
| 23-22 | MeowHQ 虛擬體驗：選虛擬貓＋選喵戶，貓放進 3D 室內空間走動（第一版）；之後跳上家具、遊戲玩法 | admin-moderation | — | P2 | #150 | Tina × Claude Code | 審查中 |
| 23-23 | MeowHQ 虛擬體驗故事線「貓咪的吃喝拉撒」＋成貓／幼貓 eat、drink、toilet 動作 | admin-moderation | 23-22 | P2 | #297 | Tina × Claude Code | 完成 |
| 23-24 | 故事線辨識餐碗組的飼料碗／水碗、站對位置；母體補齊撒嬌、休息、理毛 | admin-moderation | 23-23 | P2 | #304 | Tina × Claude Code | 完成 |
| 23-25 | 故事線：貓不要穿越碗盆（碗碰撞、腳掌踩碗外、吃飯往前伸脖子） | admin-moderation | 23-24 | P2 | #318 | Tina × Claude Code | 審查中 |
| 23-26 | 成貓、幼貓吃飯、喝水動作重做（各用自己的骨架直接製作） | admin-moderation | 23-23 | P2 | #330 | Tina × Claude Code | 完成 |
| 23-27 | 成貓吃飯、喝水再重做（背線緩弧、側面平面 IK 不 roll） | admin-moderation | 23-26 | P2 | #336 | Tina × Claude Code | 完成（#339 已合併） |
| 23-28 | 大貓走路 v3：骨架翻面、肚子權重只跟脊椎、前腳落地收回肩膀下方、一圈 1 秒 | admin-moderation | 23-16 | P2 | #340 | Tina × Claude Code | 完成（#342 已合併；待上傳 Storage） |
| 23-29 | 理毛 groom 重做 v3：成貓、幼貓分開製作（香盒坐、左前臂斜 45°、腳掌送到嘴前、舔 4 下停一拍） | admin-moderation | 23-24 | P2 | #319 | Tina × Claude Code | 審查中 |
| 23-30 | 成貓母體脊椎拉直、加鬍鬚；貼圖三視角投影＋自然虎斑補紋 | admin-moderation | — | P2 | #365 | Tina × Claude Code | 完成（待上傳 Storage） |
| 23-31 | 示範貓第一隻虎斑貓換新紋理、顯示 AI 三視角 | admin-moderation | 23-30 | P2 | #367 | Tina × Claude Code | 完成 |
| 23-32 | 體型預覽成貓分頁套用第一隻虎斑貓紋理 | admin-moderation | 23-31 | P2 | #369 | Tina × Claude Code | 完成 |
| 23-33 | 成貓理毛 v4：端坐、左右手輪流 | admin-moderation | 23-29 | P2 | #377 | Tina × Claude Code | 完成（待上傳 Storage） |
| 23-34 | 幼貓母體四腳站直、左右對稱（右半身照左半身鏡像、前腳直立） | admin-moderation | — | P2 | #373 | Tina × Claude Code | 完成（#374） |
| 23-15 | MeowHQ 登入頁依 Stitch 改版、瀏覽器標題改 MeoWho｜喵戶總部 | admin-moderation | — | P2 | #116 | Tina × Claude Code | 完成（#117 已合併） |
| 23-14 | MeowHQ AI 三視角第二階段：worker 同時用三張照片上色；製作glb工作區選擇要產生的動作 | admin-moderation | 23-13 | P2 | 待建立 | — | 待辦 |
| 23-16 | MeowHQ 3D 貓咪體型預覽新增大貓（大貓｜成貓｜幼貓三分頁、貓咪資訊）；大貓只做預覽 | admin-moderation | 23-13 | P2 | #302 | Tina × Claude Code | 完成（#305 已合併；肚子鼓包修正見 fix/302-large-cat-belly） |
| 23-11 | MeowHQ 貓咪模型：同一隻貓可切換成貓／幼貓體型 | admin-moderation | 23-10 | P2 | #104 | Tina × Codex | 審查中 |
| 28-1 | 首頁、頁首頁尾改用 meowwho-v2 新版 UI；內頁版型待續 | matching | 26 | P1 | #64 | 子哲 × Claude | 完成（#65 已合併） |
| 29 | 部署改為 Vercel meowho、Supabase 改為獨立專案（決策 005）的文件 | account | — | P1 | #66 | 子哲 × Claude | 審查中 |
| 30 | 修正 Google 登入後看不到頭像 | account | — | P1 | #68 | 子哲 × Claude | 審查中 |
| 31 | MeowHQ 室內空間移除寶麗來轉換卡片 | admin-moderation | — | P2 | — | Tina × Codex | 進行中 |
| 39 | MeowHQ 側欄在平板、電腦也能收合 | admin-moderation | — | P2 | #193 | Tina × Claude Code | 審查中 |
| 38 | MeowHQ 頂列加「前往前台」連結 | admin-moderation | — | P2 | #191 | Tina × Claude Code | 審查中 |
| 36 | 前台新增貓咪：生活照至少 3 張、年齡輸入，月齡帶進 3D 模型 | ai-onboarding、household-cats | — | P1 | #185 | Tina × Claude Code | 審查中 |
| 37 | 前台新增貓咪：側面／正面／背面三張、自動 AI 三視角、前台預覽、接 MeowHQ | ai-onboarding、household-cats | 35、36 | P1 | #188 | Tina × Claude Code | 審查中 |
| 32 | MeowHQ 貓戶管理模組：依類別查看貓戶、貓咪卡片（0020 待執行） | admin-moderation | — | P2 | #179 | Tina × Claude Code | 審查中 |
| 34 | MeowHQ 左側選單視覺優化（字級層級、間距、可收合樹狀） | admin-moderation | — | P2 | #183 | Tina × Claude Code | 審查中 |
| 35 | 前台待領養貓的 3D 模型接上 MeowHQ 貓咪製作：照片搬到製作用 bucket、列表加喵戶欄；下一步前台三張照片＋年齡 | household-cats、admin-moderation | — | P1 | #181 | Tina × Claude Code | 審查中 |

## 高風險 PoC（11/05 前）

| PoC | 負責 | 狀態 |
|---|---|---|
| WebXR／A-Frame Android、iPhone 實機 | F | 待辦 |
| 以原貓照片生成虛擬貓（比較 3 方案） | F | 待辦 |
| 60 秒影片 → 抽影格＋Vision＋Whisper，量測耗時成本 | E | 待辦 |
| 皇家台灣官網 robots.txt 與試爬 5 頁 | A | 待辦 |
| RAG 20 隻貓 × 10 句，前 3 名命中率 ≥ 70% | E | 待辦 |

## 待確認（需要人決定）

- 退養流程細節
- LLM 供應商（程式已可切換 Gemini／OpenAI／Azure／Anthropic，只差決定）、影像生成方案
- ~~3D 模型與影片的儲存位置~~：已決定 Azure Blob（決策 006，2026-10-31）
- 皇家專題要求（必做功能、KPI、品牌規範、資料提供、購買連結導向）
- Vercel 部署方式（repo 維持 private 或改 public）
- 組員姓名與 A–F 對應
- 是否改用 Tailwind，或正式採用 `globals.css` 設計 token（影響 T-P0-01）
- 使用中的虛擬體驗元件是否只能下架不能刪除；停權期間貓戶與待領養貓是否隱藏；用品類商品欄位（SRS §10 #8–11）
- 品牌名稱寫法：文件與網站一律「Meowho喵戶」（2026-10-29 Tina 決定，取代 Meow Home／MeowHome；GitHub 倉庫、Vercel 專案、`meow_` 資料庫前綴與 MeowHQ 後台名稱不變）

## 建議（agent 發現、尚未有人認領）

- （渝茜提出，2026-11-07，尚未認領）虛擬飼養改版：①環境報告先行，進遊戲時有報告就跳過「上傳房間」「居家安全」；②逗貓、餵飼料、換水改 3D（貓用位置移動，不需撲跳動作）。細節在 `docs/modules/readiness.md`「虛擬飼養改版待辦」
- #56 領養人 profile 在 GitHub 指派給清俊，但 `21_第一週衝刺_Scope.md` 寫在子哲範圍；背景標記「自填」要用它的資料，負責人待組內確認
- （#237 發現）`.env.example` 有一段 KPI Dashboard 的註解是亂碼（編碼錯誤），建議重存成 UTF-8
- （#237 發現）`FloorplanViewer.tsx` 有 3 個既有的 lint 警告（hooks 依賴、未用的 `room` 參數），沒有在 #237 處理
- 難度參數暫緩（子哲 2026-10-31）：等與渝茜（#58）確認後再加進貓咪 profile

- 首頁還缺：貓咪詳細頁（點卡片進入）、中途之家專區（找中途、認證中途）、領養人 onboarding 入口（目前「我想領養」只導到搜尋列）、知識區完整頁、登入後的個人化首頁（我的貓戶摘要、通知）
- 貓咪公開頁 `/cats/[id]` 與分享預覽（任務 2 剩餘部分）
- Supabase 安全檢查：`meow_is_admin`、`meow_set_admin`、`meow_review_verification`、`meow_notify_admins_verification` 為 SECURITY DEFINER 且 anon 可呼叫（函式內有管理員檢查，風險低）；✅ Tina 同意：在 `0002_meow_hq.sql` 以 `revoke execute ... from anon` 收緊（併入 #19）
- PWA：補 `src/app/manifest.ts` 與 192／512 App 圖示（T-P0-01 剩餘部分）
- 系統圖表 PNG 仍顯示舊名 CAT Home，需重新輸出（`.mmd` 已改）
- MeowHQ（T-HQ-01 實作時發現，待 Tina 決定）：
  - ✅ 已決定（Tina 同意）：`unban` 納入處置類型（共 8 種）；`grant_module`、`grant_badge`、`set_role` 只作稽核日誌 action。
  - 規格書 §4.7 沒列「解除停權、重新上架、加入／移出黑名單」的快選原因，目前為空清單。
  - 現有 `role = 'admin'` 的使用者，✅ 已決定（Tina 同意）：現有 `admin` 一律遷移成 `system_admin`。
- MeowHQ db（#19 實作時發現）：
  - ✅ 已處理（#21 改 `isAdmin`、舊後台移除）：執行 `0002_meow_hq.sql` 會讓前端的 `isAdmin`（`src/components/Auth.tsx`，`role === "admin"`）與舊隱藏後台 `/mh-console-8k2p` 失效（現有 admin 升為 `system_admin`）。前端在 #21 調整前，建議先不要在正式環境執行 0002，或由 Tina 決定接受舊後台暫時不可用。
  - 0001 的 `meow_guard_profile` 有錯：管理員更新別人的會員資料時會把對方 Email 蓋成自己的（0002 已修正）。
  - 開發計畫 T-HQ-02 要求「收緊 `meow_is_admin` 的 anon 執行權」；這會讓依賴它的 RLS policy 對匿名訪客出錯，0002 已把相關 policy 改為 `to authenticated` 才收回。之後新增 policy 若會被匿名查詢，**不要**呼叫權限函式。
  - SQL 測試可用 `node supabase/tests/run-pglite.mjs` 在本機臨時資料庫執行（`npm i --no-save @electric-sql/pglite`）。要不要納入 `npm test` 與 CI（需把 `@electric-sql/pglite` 加進 devDependencies，屬 Issue #19 範圍外），請 Tina 決定。
- MeowHQ 系統管理員離職流程（Tina 2026-10-29 提出，待認領）：離職＝由另一位系統管理員執行 `meow_set_role` 撤銷身分（降成一般會員或管理員），原因必填並寫稽核日誌；至少要保留一位，移除前須先指定接手者。**黑名單只用於貓友與貓戶長，不適用於管理員與系統管理員**（Tina 2026-10-29 確認），所以離職流程不包含加入黑名單。建議在 Admin 授權畫面（#23）提供「撤銷身分」操作：降級＋清空模組授權＋一筆稽核日誌。
- MeowHQ 黑名單對象（Tina 2026-10-29 確認，規格書 R9 已更新，#29、#30）：#26 的 `meow_ban_email` 已拒絕管理員（`target_is_admin`）、系統管理員（`target_is_system_admin`），以及尚未登入過的帳號（`not_found`）。#28（#20）的 `canBan` 已同步拒絕管理員；「尚未登入過的帳號」屬前端輸入檢查，由 #23／#24 處理。

  - （#20 logic）UT-HQ-05 的「貓友／貓戶長」在 `canSuspend` 都是 `role: member`，函式不區分；#20 的 `canSuspend` 對沒有「用戶權限管理」授權者回傳「沒有停權的權限」，規格書與測試計畫未規定此文字，Tina 可調整。
- 語音輸入的 Whisper 備援（Safari／Firefox 不支援瀏覽器語音辨識）
- MeowHQ shell（#21 實作時發現，待 Tina 決定）：(1) `Auth.tsx` 的 `isAdmin` 已納入 #21；舊後台已移除（Tina 2026-10-29 決定）；(2) 規格書未定義鈴鐺點開後的通知面板，目前鈴鐺只顯示未讀數（T-HQ-12 之後處理）；(3) 規格書 §4.9 要求「手機從底部出現」的 toast 與 `查看紀錄` 連結目標（稽核日誌頁網址）尚未決定，目前由呼叫端傳入 `logHref`。
- #24 用戶權限管理（Claude，2026-10-29）：審查中，PR 未合併；「要求補件」目前以退回＋快選原因處理，若要獨立狀態需新 migration（待 Tina 決定）。
