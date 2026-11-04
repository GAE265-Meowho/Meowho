# 虛擬體驗元件管理：平面圖轉換（rooms-floorplan）規格書

| 項目 | 內容 |
|---|---|
| 文件版本 | v0.1（2026/11/02，Tina 規格討論定稿；Issue #138） |
| 所屬模組 | MeowHQ「虛擬體驗元件管理」→ 室內空間 → 平面圖轉換（`/MeowHQ/assets?tab=rooms-floorplan`，權限模組 `virtual_assets`） |
| 上層文件 | `01_MeowHQ_後台管理規格書.md`；決策 006（Azure Blob）、007（居家影像不公開）、008（影片房間 MVP） |
| 參考程式 | `C:\TinaLee\Projects\GAE265\Meow\meowho_3d_room`（沿用座標系、`VIS_`／`COL_` 命名、`surface: walkable` 標記；**不沿用** Blender 產生流程） |
| 目的 | 管理員上傳平面圖，AI 自動轉成可以放貓的 3D 室內空間 |

---

## 1. 一句話流程

上傳一戶的各房間平面圖 → AI 讀圖成 JSON（牆、門、窗、家具、比例）→ 瀏覽器即時蓋出 3D（娃娃屋並排）→ 有錯時在 2D 線框上修正 → 放貓進去走。

## 2. 已定決策

| # | 題目 | 決定 |
|---|---|---|
| Q1 | 平面圖怎麼變結構資料 | AI（Azure gpt-6-luna 視覺）讀圖，輸出 JSON |
| Q2 | 要不要人確認 | **預設全自動**；同時顯示 AI 線框疊在原圖上，錯了可改，改完重新產生 |
| Q3 | 家具 | AI 認出家具符號，擺上**比例正確的方塊家具**（含碰撞） |
| Q4 | 3D 在哪裡蓋 | **瀏覽器直接蓋**（three.js＋Rapier，專案已有），只存 JSON；不用 Blender、不用 worker |
| — | 放貓 | 可以；沿用 #93 的 `RoomCat`／`RoomPhysics`（地板座標＝公尺），預設成貓母體 `base_clips.glb` |
| Q5 | 視角 | **兩個都有**：預設娃娃屋俯視（無天花板、可轉、點地板貓走過去）；點某間房 → 第一人稱 |
| Q6 | 比例尺 | **AI 自己估**：有尺寸標註就讀；沒有就用門寬約 0.9 m、床長約 2 m 等常見尺寸推算；牆高預設 2.8 m；錯了在線框修 |
| Q7 | 誰能上傳 | 第一版只有 MeowHQ 管理員；資料表預留 `owner_household_id`，之後開放前台貓戶 |
| Q8 | AI 在哪裡跑 | Vercel API route 直接呼叫 Azure（約 20–60 秒），不排隊 |
| — | 原圖儲存 | **Azure Blob**（`MEDIA_STORAGE=azure`，沿用 `src/lib/storage/`），container 私有；前端看原圖用短時效 SAS |
| Q9 | 檔案 | 只收 JPG／PNG，單檔 ≤ 10 MB |
| Q9-2 | 張數 | **每個房間各傳一張局部平面圖**（客廳一張、臥室一張…） |
| Q10 | 多房間怎麼拼 | **不拼接**：娃娃屋裡各間獨立並排（中間留走道），貓只在所選房間內活動 |
| Q11 | 資料分組 | **一筆＝一戶**，底下多間房，可之後增刪房間 |
| Q13 | 實景照片（#144，Tina 2026-11-03） | 同一個上傳也收**室內實景照片**，AI 自動分辨平面圖或照片；一間房可傳 **1～4 張**不同角度照片合併判斷；實景照片的比例一律記為推估；原圖保留（決策 007 補充第二個例外） |
| Q14 | 3D 外觀（Tina 2026-11-03） | 效果比照 `Meow/meowho_3d_room`：家具換成**家具模型庫**（`scripts/blender/furniture_kit.py` 沿用該專案的材質與建模做法，一種家具一個 glb，先固定一套放在 `public/hq-floorplan/furniture/`），地板橡木貼圖、柔光陰影，面向鏡頭的牆自動降低（娃娃屋剖面） |
| Q15 | 家具位置（Tina 2026-11-03） | AI 先用文字描述每面牆有什麼（`layoutNotes`），家具填**背面靠哪面牆**（`wall`）；系統把家具貼齊該牆內側、背面朝牆（`read.ts` 的 `snapToWall`） |
| Q12 | 原圖保留 | **保留，可預覽原圖**；列為決策 007 的例外（平面圖是格局圖，不是居家實景照片） |

## 3. 畫面

### 3.1 一頁完成（`?tab=rooms-floorplan`，Tina 2026-11-02 修改）
- 上方「新增一戶」：戶名（1–40 字，不可重複）＋**同時選各房間平面圖**（可多選，檔名當房名、可改名或移除）→「建立並上傳」，逐張上傳、不換頁。中途失敗時戶已建立，顯示哪一張失敗，可到「管理」補傳。
- 下方每一戶一張**預覽卡片**：封面＝第一張平面圖，下方房間名稱、房間數、建立者、更新時間；「管理」進一戶的工作頁（補傳、改名、刪房間），「刪除」要再確認一次。

### 3.2 一戶的工作頁
- **左：房間清單**。每間顯示名稱（AI 讀出，可改）、原圖縮圖、狀態（讀圖中／完成／失敗）；點縮圖可放大預覽原圖。「新增房間」上傳一張圖；可刪除房間。
- **右：3D 檢視**，預設娃娃屋並排；點房間進第一人稱，「回總覽」返回。
- **線框修正**（點房間的「修正」才展開）：原圖上疊 AI 線框，可拖牆的端點、刪改門窗與家具方塊、改房名、改比例（拉一條線填實際長度）、改牆高。「套用」後 3D 立即更新並存檔；「重新讀圖」整間重跑 AI。
- 版面依 MeowHQ 規範：乾淨簡潔、同級區塊等分；線條圖示，不用 emoji。

## 4. 資料

### 4.1 Migration（`0015_meow_room_floorplan.sql`，執行前須 Tina 確認）
在 `meow_room_models` 加欄位，影片房間不受影響：

```sql
alter table public.meow_room_models
  add column if not exists source text not null default 'video' check (source in ('video', 'floorplan')),
  add column if not exists owner_household_id uuid references public.meow_households (id) on delete cascade;
```

- 一戶＝`meow_room_models` 一列（`source = 'floorplan'`，`video_path`／`result_path` 為 null）。
- 戶的狀態：任一房讀圖中 → `running`；全部完成 → `ready`；有房失敗 → `failed`。
- 不使用 `meow_room_jobs`（不排隊）。

### 4.2 `meta`（jsonb）
```jsonc
{
  "version": 1,
  "next": 3,                                               // 下一個房間編號；拿上傳網址時先保留，刪掉的編號不重用
  "rooms": [
    {
      "id": "r1",
      "name": "客廳",
      "image_path": "floorplans/<room_model_id>/r1.png",   // Azure Blob，私有
      "status": "ready",                                   // uploaded（待讀圖）| reading | ready | failed
      "error": null,
      "scale": { "m_per_px": 0.012, "source": "label" },   // label | estimate | manual
      "wall_height_m": 2.8,
      "walls":     [{ "a": [0, 0], "b": [4.2, 0], "t": 0.15 }],               // 公尺，平面座標 (x, y)
      "openings":  [{ "kind": "door", "wall": 0, "at": 1.2, "w": 0.9, "h": 2.1 },
                    { "kind": "window", "wall": 1, "at": 0.8, "w": 1.5, "h": 1.2, "sill": 0.9 }],
      "furniture": [{ "kind": "sofa", "label": "沙發", "x": 1.5, "y": 2.0, "w": 2.1, "d": 0.9, "h": 0.8, "rot": 0, "surface": "walkable" }],
      "ai_raw": { /* AI 原始輸出，除錯用 */ },
      "edited": false
    }
  ]
}
```
- 家具 `kind` 限定清單（sofa、bed、table、chair、desk、wardrobe、cabinet、tv_stand、counter、toilet、bathtub、other），各有預設高度與顏色。
- 座標系與 `meowho_3d_room` 一致：公尺、地板 z=0；three.js 端換成 Y 向上。

### 4.3 儲存
- Azure Blob：`floorplans/<room_model_id>/<room_id>.<png|jpg>`。資料庫只存路徑（決策 006 可轉移規則）。
- 原圖保留（Q12：可預覽，線框也疊在原圖上）；只有刪房間或刪戶時一併刪 Blob。
- 上傳：瀏覽器拿 SAS 直傳 Blob（避開 Vercel 4.5 MB 請求上限）。兩步：`POST /api/hq/floorplans/<戶>/rooms {type,size}` 保留房間編號、回上傳網址 → 瀏覽器 PUT → `POST …/rooms {roomId,path,name}` 確認檔案在 Blob 後才加入。
- 注意：Azure CORS 只允許正式站與 localhost，Vercel PR 預覽網址無法直傳（同影片上傳）。

## 5. AI 讀圖

- `POST /api/hq/rooms/floorplan/read`：參數為戶 id＋房間 id；後端透過 `src/lib/storage/` 讀圖，走 `src/lib/ai/` 的結構化鏈呼叫 Azure `gpt-6-luna`（`AZURE_OPENAI_CHAT_DEPLOYMENT_NAME`），**不可直接 import 供應商 SDK**（AGENTS.md §2）。
- 輸出格式寫在 `src/lib/ai/schemas.ts`（zod `floorplanRoomSchema`）；提示詞放 `src/lib/prompts/floorplan.ts`；圖上文字視為資料（決策 004）。
- Prompt 重點：只讀這一張圖的一間房；牆用中心線端點；門窗掛在牆上；家具只用限定清單；回傳比例來源（label／estimate）。
- 後端驗證：牆至少 3 段且大致封閉、尺寸在合理範圍（單邊 1–20 m、家具不超出房間）；不合格就標 `failed` 並顯示原因，可「重新讀圖」。
- 逾時：route 設 `maxDuration = 120`。
- 觸發（PR 3）：房間上傳確認後由 `after()` 背景自動讀圖；`POST /api/hq/rooms/floorplan/read` 立即回 202，畫面每 4 秒輪詢。讀圖中超過 3 分鐘視為中斷，可重新讀圖。
- AI 輸出用扁平欄位（`ax, ay, bx, by`），門窗只讀牆、位置、寬度；門高 2.1 m、窗高 1.2 m（窗台 0.9 m）、家具高度依種類給預設值，由 `src/lib/hq/floorplans/read.ts` 整理成 §4.2 格式。
- 房名：只有預設名稱「房間 N」會被 AI 讀出的房名取代，管理員自己填的不動（並當作提示送給 AI）。
- 實景照片（#144）：AI 輸出 `kind`＝floorplan／photo／other，只有 other 判定失敗；照片用門高、床長、地磚等已知尺寸推估公尺，看不到的牆推成最可能的形狀。房間的其他角度照片存 `photo_paths`（`floorplans/<戶>/<房間>_<6 碼>.<png|jpg>`），讀圖時與主圖一起送；格局記 `input`（floorplan／photo）。加照片後自動重新讀圖，移除照片不自動重讀。API：`POST|DELETE /api/hq/floorplans/<戶>/rooms/<房間>/photos`。

## 6. 3D 產生（前端）

- 依 JSON 用 three.js 拉出：地板、牆（扣掉門窗洞）、門框、窗玻璃（半透明）、家具方塊；無天花板（娃娃屋）。
- Rapier：牆、家具建 cuboid collider；`surface: walkable` 的家具頂面貓可以跳上去。
- 並排：各房依 bounding box 由左到右排，間距 1 m；房名做成 3D 上方的膠囊列：「全部」＝整戶並排，點某間＝3D 只顯示那一間並重新取景（`focusScenes`），同時切換下方的原圖預覽。
- 地板先用房間外框矩形（斜牆房間會多一點地板，線框修正時再處理）。
- 貓：點進某間房才放貓；沿用 `src/lib/hq/rooms/` 的 `RoomCat`、`RoomPhysics`，世界座標直接用公尺。
- 新元件 `FloorplanViewer`（`next/dynamic`、`ssr: false`），不改動 `RoomViewer`（Gaussian Splat 用）。
- 家具模型庫（Q14）：`kit.ts` 的 `FURNITURE_KIT` 記每個模型的寬、深、`ref_h`（AI 高度對應的模型高度，例如床是床墊高、不含床頭板），網頁依讀圖尺寸縮放；模型正面朝 +Z。要改模型：改 `scripts/blender/furniture_kit.py` 後執行（`blender -b --python …` 或 `pip install bpy` 後 `python3 …`），`kit.test.ts` 會檢查尺寸與 kit.json 一致。
- 娃娃屋剖面：每段牆帶朝外方向 `out`，鏡頭在牆外側時牆降到 0.25 m、門楣窗台玻璃先隱藏，轉到另一邊自動恢復；碰撞體不受影響。

## 7. 權限與隱私

- 頁面、API、Blob SAS 都要 `virtual_assets` 權限（RLS 沿用 `meow_room_models` 既有 policy）。
- 原圖保留是決策 007「居家影像產出後刪除」的例外（Q12，Tina 2026-11-02）：平面圖是格局圖、不是實景照片；仍依決策 007 **不公開**，Blob container 私有，SAS 有效 10 分鐘。須在 `docs/decisions/007-home-media-retention.md` 補記此例外。
- `owner_household_id` 本版一律 null；開放前台前要另訂權限與 AI 用量限制。

## 8. 實作拆分（建議 PR 順序）

1. ✅ Migration `0015` ＋ 型別、Blob 上傳 SAS API（#138 PR 1）。
2. ✅ 一戶清單、新增一戶、新增房間上傳、原圖預覽、改名、刪除（#138 PR 1）。
3. ✅ AI 讀圖 API（structured output＋驗證）＋測試用固定 JSON；上傳後自動讀圖、可重新讀圖（#138 PR 3）。
4. ✅ `FloorplanViewer`：JSON → 3D 娃娃屋並排＋碰撞體資料（#138 步驟 4）。場景資料是純函式 `src/lib/hq/floorplans/scene.ts`（`houseScene`、`colliders`）；Rapier 物理在步驟 5 放貓時接上。房名改放在 3D 上方的按鈕列（場景內浮動標籤在 React 19 會掉、手機不好點）。
5. 點房間進第一人稱＋放貓。
6. 2D 線框修正編輯器。
7. ✅ `RoomsTab` 拿掉「平面圖轉換」的「規劃中」標籤（#138 PR 1）。

## 9. 驗收

- 上傳 1 張客廳平面圖，2 分鐘內看到 3D 空屋＋方塊家具，比例目測合理（門寬約 0.8–1 m）。
- 同一戶加第 2 間（臥室），娃娃屋並排顯示兩間，房名正確。
- 點客廳進第一人稱，貓會走、會被牆擋、能跳上沙發。
- 線框改一面牆位置後 3D 立即更新，重新整理後仍保留。
- 沒有 `virtual_assets` 權限者：頁面、API、原圖網址都無法存取。
- 上傳 PDF 或 > 10 MB 檔案：顯示錯誤，不建立房間。

## 10. 待決／風險

- AI 讀複雜平面圖（斜牆、弧牆）準確度未知：第一版斜牆照讀，弧牆以折線近似。
- 一戶房間數上限：先定 8 間。
- 手機效能：家具方塊與牆合併幾何（merge）以降低 draw call。

## 11. 虛擬體驗（#150，Tina 2026-11-03）

- 位置：MeowHQ「虛擬體驗元件管理」左側選單第一層「虛擬體驗」（`/MeowHQ/assets?tab=experience&cat=<貓>&house=<戶>`，選擇寫進網址）。
- 選虛擬貓：只列出有**已確認紋理貼圖**的貓（規則同貓咪頁，`catLook.ts`）；貓＝共用母體 `base_clips.glb`＋這隻貓的貼圖，不需要每隻貓匯出 glb。
- 選喵戶：只列出有讀圖完成房間的戶；有多間時用 3D 上方的膠囊切換（有貓時沒有「全部」）。
- 互動（第一版）：點地板貓走過去（walk 動作，停下播 idle），被牆與家具擋住、沿著邊滑過去；門楣在頭上不擋路；閒置 6 秒自己找空位逛。規則是純函式 `src/lib/hq/floorplans/catwalk.ts`。
- 貓的大小與鏡頭（Tina 2026-11-03）：成貓母體約長 0.58、高 0.51 m（接近真實），整間房的鏡頭裡看起來太小 → 虛擬體驗裡貓放大 1.2 倍（`CAT_SCALE`），鏡頭預設靠近貓、跟著貓移動（仍可縮放看整間）。貓的起點固定在離房間中心最近的空位。
- 跳上家具（Tina 2026-11-03）：點床、沙發（只算坐墊）、桌子、書桌、櫃子、電視櫃、中島（檯面 ≤ 1 m）→ 貓走到旁邊、弧線跳上去，在上面可以走；點地板或別的家具會先跳下來。母體還沒有 jump 動作，跳躍先播 walk。閒置時在地板上逛、在床或沙發上睡覺（sleep）。規則是純函式 `catjump.ts`；之後若要更真實的碰撞（推倒杯子等）再接 Rapier。
- 之後：第一人稱、遊戲玩法（7 天虛擬飼養任務、居家安全挑戰等）。

