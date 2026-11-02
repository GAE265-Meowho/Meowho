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

## 6. 3D 產生（前端）

- 依 JSON 用 three.js 拉出：地板、牆（扣掉門窗洞）、門框、窗玻璃（半透明）、家具方塊；無天花板（娃娃屋）。
- Rapier：牆、家具建 cuboid collider；`surface: walkable` 的家具頂面貓可以跳上去。
- 並排：各房依 bounding box 由左到右排，間距 1 m，房名標籤浮在上方。
- 貓：點進某間房才放貓；沿用 `src/lib/hq/rooms/` 的 `RoomCat`、`RoomPhysics`，世界座標直接用公尺。
- 新元件 `FloorplanViewer`（`next/dynamic`、`ssr: false`），不改動 `RoomViewer`（Gaussian Splat 用）。

## 7. 權限與隱私

- 頁面、API、Blob SAS 都要 `virtual_assets` 權限（RLS 沿用 `meow_room_models` 既有 policy）。
- 原圖保留是決策 007「居家影像產出後刪除」的例外（Q12，Tina 2026-11-02）：平面圖是格局圖、不是實景照片；仍依決策 007 **不公開**，Blob container 私有，SAS 有效 10 分鐘。須在 `docs/decisions/007-home-media-retention.md` 補記此例外。
- `owner_household_id` 本版一律 null；開放前台前要另訂權限與 AI 用量限制。

## 8. 實作拆分（建議 PR 順序）

1. ✅ Migration `0015` ＋ 型別、Blob 上傳 SAS API（#138 PR 1）。
2. ✅ 一戶清單、新增一戶、新增房間上傳、原圖預覽、改名、刪除（#138 PR 1）。
3. AI 讀圖 API（structured output＋驗證）＋測試用固定 JSON。
4. `FloorplanViewer`：JSON → 3D 娃娃屋並排＋碰撞。
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
