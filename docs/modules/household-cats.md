# 模組：貓戶、貓咪與時光小屋（household-cats）

> 最後更新：2026-10-28｜Tina × Claude Code
> 規則：本檔隨程式碼同一個 PR 更新；「決策」與「地雷」只增不刪（過時的標註［已失效］）。

## 目的
每位會員一個貓戶、多隻貓；貓咪資料、公開設定、獸醫診斷、領養設定；日記（＝貼文）、相簿、影片、時間軸。

## 負責
主責：B、C｜支援：E

## 對應需求
- SRS：M02（FR-02-*）、M04（FR-04-*）
- 測試：UT-02-*、UT-04-*、MT-02-*、MT-04-*
- PLAN 任務：2、4

## 目前狀態
貓戶與貓咪資料表、RLS、照片儲存已建立；可透過 `/onboarding` 聊天建立貓戶與貓咪，`/me` 檢視（Issue #1）。首頁卡片仍使用 `mock-data.ts` 的示意資料（任務 3 改讀真實資料）。日記、相簿、時間軸尚未開始。

## 中途的 3D 貓（規格 09 §5.1）——目前是預設 3D 貓，之後要接真正的產生流程

**現在的做法（2026-11-04，#161）**
- 中途新增貓時，貓是「準備中」（`meow_cats.status = 'preparing'`），前台看不到。
- 建立 profile 後，`NewCatFlow`（#206 起取代 `IntakeChat`）呼叫 `POST /api/cats/[id]/model`；貓咪頁的 `PublishPanel` 發現還沒有 3D 貓時也會再呼叫一次（同一隻貓只建一筆）。
- 這個 API 只建「預設 3D 貓」：`meow_cat_models` 一筆（`owner_type = 'member'`、`cat_id`＝這隻貓、`status = 'ready'`、`meta.source = 'default'`）＋ `meow_cat_model_variants` 一筆（體型依年齡層，`albedo_path = 'default'`）。
- 預覽用母體 `public/hq-cat-models/base/` 加母體自己的貼圖（`albedo_path = 'default'` 時 `CatPreview` 收到 `albedoUrl = null`）。
- **照片（#181，2026-11-04）**：建模型時把封面照片從 `meow-cat-photos` 複製到 `meow-cat-model-photos/<模型ID>/photo.<副檔名>`，`photo_path` 指向複製後的檔案（`src/lib/cat-model-photo.ts`）。之前建的舊模型 `photo_path` 還是前台路徑，MeowHQ 製作頁讀照片時（`sbFileRedirect`）或中途再呼叫 API 時會自動補複製。MeowHQ 貓咪模型列表、貓咪頁、製作glb工作區顯示所屬喵戶。目前 Step 02～04 由管理員在 MeowHQ 手動觸發，之後改自動。
- **三個角度＋自動 AI 三視角（#188，2026-11-04）**：新增貓咪時依序上傳側面、正面、背面（`CatFields.angles`，必填；之後可再加生活照到 5 張）。建立後 `NewCatFlow` 帶 `{ angles }` 呼叫（#206 起角度照存 `meow_cats.photo_angles`，`pickAngles` 也會讀它） `POST /api/cats/[id]/model`：三張複製成 `<模型ID>/photo.*`、`photo_front.*`、`photo_back.*`（`profile.extra_photos`），三張都有就用 service role 呼叫 `sbStartViews(..., { client })` 在 `after()` 自動產生 AI 三視角（Step 02）。前台貓咪頁的「AI 三視角」（`AiViewsPreview`，`GET /api/cats/[id]/model/views`，只給中途、短時效網址）顯示進度與結果；MeowHQ 製作頁讀同一份 `profile.generated`。Step 03、04 仍由管理員在 MeowHQ 手動觸發。修改既有的貓（`angles = null`）只需要有照片，不要求三個角度。
- 中途按「確認使用」→ `meow_confirm_cat_model()` 把 `albedo_path` 複製到 `confirmed_albedo`，「準備出發找新主人」的 3D 檢查就通過。

**之後要接的流程與位置**（照規格 09 §5.1 的流程圖）

| 步驟 | 要改的地方 | 說明 |
|---|---|---|
| 1. 照片規則 | `src/components/new-cat/PhotoTalk.tsx`（#206：正面、側面＊、背面＋生活照 6 張） | 規格要「只有這隻貓的獨立照片 1 張必填＋其他角度 2 張選填」；現在是一般照片（最多 5 張，第 1 張當封面）。3D 用的照片要另外上傳到 `meow-cat-model-photos/member/<中途的 id>/`（0017 已開 policy） |
| 2. 建立模型改成排工作 | `src/app/api/cats/[id]/model/route.ts` 的「建立預設 3D 貓」那段 | 改成建 `status = 'queued'` 的模型，`photo_path` 指向步驟 1 的照片，再排入 MeowHQ 的 AI 檢查（是不是貓、年齡層：`src/lib/hq/cat-models/ai-analyze.ts`）與三視角（`ai-views.ts`） |
| 3. 產生紋理貼圖 | `paint_worker`（目前只在 Tina 的電腦，見 HANDOFF） | 完成時把貼圖路徑寫進 `meow_cat_model_variants.albedo_path`、模型改 `status = 'ready'`；失敗寫 `status = 'failed'` 和原因 |
| 4. 通知中途 | 同上完成的地方 | 寫 `meow_notifications`：「{貓名}的 3D 模型做好了，看看像不像牠。」連到 `/cats/<id>#model`；失敗時附原因和怎麼拍 |
| 5. 預覽與重新產生 | `src/components/cats/PublishPanel.tsx` | 已經會顯示 `albedo_path` 的貼圖；要補「原照片和 3D 並排」與「重新產生」按鈕（換照片→回到步驟 2），以及 `queued`／`running`／`failed` 的畫面 |
| 6. 拿掉預設 3D 貓 | `src/lib/cat-publish.ts` 的 `DEFAULT_ALBEDO`、`defaultModelRows` | 流程接好後刪掉；已經用預設 3D 貓出發的貓，可以留著或請中途重新產生 |

- `meow_cat_models` 只有 MeowHQ（virtual_assets）能寫，前台都經過伺服器（service role），寫之前先用 `meow_cat_publish_check()` 確認是這隻貓的中途。
- 預設 3D 貓也會出現在 MeowHQ 的貓咪模型列表（`owner_type = 'member'`）。

- 2026-11-04 我的喵戶改版（子哲）：每個喵戶一個區塊（頭像、名稱、地區、介紹、右上角修改）；中途有「領養管理」「新增貓咪」與分頁「待領養貓／還在準備」，一般飼主有「生成 3D 環境」「居家安全檢測」與分頁「我的貓／收藏貓」（`src/lib/my-homes.ts`）。貓卡片只留修改圖示；刪除喵戶、刪除貓咪移到修改頁最下方（`src/components/me/DeleteSection.tsx`）。喵戶頭像存 `meow_households.avatar_path`（0019），檔案在 `meow-cat-photos/<喵戶長 id>/households/`，沒上傳就顯示 Google 頭像。

## 資料表（Supabase）
- 0024（#206，**尚未執行**）：`meow_cats` 加 `personality_scale`、`personality_notes`、`behavior`、`care`、`intro`、`photo_angles`、`cover`、`ai_story`；`photo_paths` 上限 6（只放生活照）；`compat` 容量放大（多了陌生人 `guest` 與說明 `notes`）；舊的健康標籤（結紮、疫苗、驅蟲、FIV／FeLV）移到 `medical`、個性標籤「安靜」改「慵懶」、生活習慣的護食等移到 `behavior`
- 已建立：`meow_households`（一個帳號最多 2 戶，trigger 限制）、`meow_cats`（visibility null＝沿用貓戶預設、status own/adoptable/adopted）、Storage bucket `meow-cat-photos`（路徑 `<uid>/<uuid>.jpg`）
- 0004 草稿（#57，**尚未執行**）：`meow_cats` 加 `life_stage`（四級，新增時必填）、`personality_tags`、`health_tags`、`description`、`photo_paths`（最多 5）；`status` 預設 `adoptable`；新表 `meow_cat_videos`（每隻最多 3 支、每支 60 秒內，RLS 同貓咪）
- 0017（已執行）：`meow_cats.status` 加 `preparing`（準備中，前台只有喵戶長看得到）；`meow_cat_models.cat_id` 綁定中途的 3D 貓
- 待建立：`cat_adoption_settings`、`cat_diagnoses`、`cat_ownerships`、`posts`、`post_cats`、`media`

## API／主要函式
- `src/lib/onboarding/household.ts`：縣市＋區解析、驗證、`toHouseholdRow`
- `src/lib/onboarding/cat.ts`：`zodiacOf`、`ageLabel`、`ageBandOf`、`toCatRow`、`validateCat`
- 待建立：公開設定判斷函式、影片 60 秒檢查

## 主要檔案
- `supabase/migrations/0001_meow.sql`
- `src/app/me/page.tsx`（我的貓戶）
- `src/lib/mock-data.ts`（首頁示意資料）

## 決策
- 2026-11-04｜新增貓咪：生活照至少 3 張（`MIN_PHOTOS`；第 1 張後可先描述，其餘填好時再要求補滿）；年紀改為選填存月齡（`est_age_months`，名片有「大約年紀」欄，對話問「大約幾個月或幾歲」，年齡層只是照片猜的時也會問），年齡層由月齡算出；取代 #109「不記月齡」。月齡帶進 3D 模型 `profile.age_months`（Tina，#185）。
- 日記與貼文合併為一種內容，用公開／私密區分。
- 位置只存縣市＋區。
- 必填只有名字、性別、照片。

- 2026-10-31（子哲）：年齡層改為 AAFP／AAHA 四級（幼貓、年輕成貓、成熟成貓、老貓），3D 體型由年齡層推出（幼貓／壯貓／老貓）；個性、健康標籤改用固定清單；新建的貓一律為待領養貓；必填改為名字、1 張照片、年齡層。詳見 #57。
- 2026-11-03（子哲，spec 09）：新增的貓先是「準備中」，中途按「準備出發找新主人」（`meow_publish_cat()`：3D 貓已確認＋任務已存）才變待領養。過渡期 0017 仍允許新增時直接是待領養，等 `/onboarding` 改送 `preparing` 後再收緊。
- 2026-10-31（子哲）：移轉後只有新喵戶長能修改貓資料，原喵戶長唯讀（見 `GLOSSARY.md` 移轉）。

## 待確認
- 相簿是否需要自訂相簿（FR-04-03 為 Must，可先做自動彙整）。

## 地雷
- 待領養貓必須強制公開，否則配對找不到。
- 私密日記不可進入公開配對向量。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
| 2026-11-03 | 子哲 × Claude Code | 準備中狀態、3D 貓綁定（spec 09、0017） | — |
| 2026-10-28 | Tina × Claude Code | 貓戶、貓咪資料表與 RLS、照片儲存、我的貓戶頁 | #1 |
| 2026-10-29 | Tina × Codex | Issue #33 走查 `/onboarding` → `/me` 流程；未修改資料表或 `/me` 查詢 | #33 |
| 2026-10-31 | 子哲 × Claude Code | #57 範圍定案（年齡層、標籤、必填、移轉後唯讀）；只改文件 | 待建立 |
| 2026-11-05 | 子哲 × Claude Code | 中途建貓新流程 PR 1（資料與規則，#206）：0024、標籤清單、年齡層 7 個月與成貓、相處加看情況與陌生人、小小壞習慣、必填與封面規則 | （見 PR） |
| 2026-11-05 | 子哲 × Claude Code | 中途建貓新流程 PR 2（畫面，#206）：`/onboarding` 新增貓咪改成拍照 → 說說牠 → 快問快答 → 名片 → 完成（`src/components/new-cat/`），取代 `IntakeChat` | （見 PR） |
| 2026-11-05 | 子哲 × Claude Code | 中途建貓新流程 PR 3（修改頁，#206）：`/cats/[id]/edit` 沿用新增的五步畫面，重新打開時每一頁帶回原本內容（`fromCatRow`，0024 以前的貓用標籤推回拉桿）；影片改成 `CatVideos` 另外加、移除；準備中的貓也能設定領養問卷；移除 `IntakeCards` | （見 PR） |
