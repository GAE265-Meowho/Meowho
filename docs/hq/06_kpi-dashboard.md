# MeowHQ KPI Dashboard（Issue #218）

> 資料來源與 KPI 定義。畫面：`/MeowHQ`；API：`GET /api/hq/dashboard`（僅管理員）。

## 權限與安全

- 僅 `meow_is_admin()` 為真的登入者可呼叫 API。
- 聚合使用伺服器端 `SUPABASE_SERVICE_ROLE_KEY`（不進前端／不出現在 response）。
- Response **不含** token、service-role key、個資、完整 request payload。

## A. 業務 KPI

| KPI | 定義 | 來源 |
|---|---|---|
| 目前住戶／家庭數 | `meow_households` 筆數（＝貓戶） | Supabase |
| 付費貓咪 | **尚未啟用**（平台無付費／訂閱欄位） | — |
| 貓咪總數 | `meow_cats` 筆數 | Supabase |
| 管理員數 | `meow_profiles.role` ∈ {admin, system_admin} | Supabase |
| 待審核合計 | 中途認證 pending ＋ 紋理貼圖待確認 ＋ 貓咪模型 draft ＋ 房間 job queued | 多表 |
| 3D 元件／模型 | 有貼圖的 `meow_cat_models` ＋ `meow_room_models` status=ready | Supabase |
| 生成中／成功／失敗 | cat_models（queued/running／ready|published／failed）＋ room_jobs（queued/running／done／error） | Supabase |

### 待審核拆分

- 中途認證：`meow_shelter_verifications.status = pending`
- 紋理貼圖：`countTexturePending`（與待辦總覽同一規則）
- 貓咪模型草稿：`meow_cat_models.status = draft`
- 房間任務排隊：`meow_room_jobs.status = queued`

## B. Supabase 資源 KPI

| KPI | 定義 |
|---|---|
| 資料表數 | 可讀取的 `meow_*` 表數量（清單見 `MEOW_TABLES`） |
| 資料列總筆數 | 上表 `count(*)` 加總（「資料總量」的**筆數**定義） |
| 資料庫容量 | `pg_database_size`（bytes；需 migration `0023_meow_dashboard_stats.sql`） |
| Storage 總用量 | 所有 `meow-*` bucket 檔案 `metadata.size` 加總（「資料總量」的**容量**定義） |
| 影片／圖片／其他 | 依 `BUCKET_KIND` 分類後的 bytes 與佔比 |
| 剩餘／使用率 | Free 方案上限 **1 GB**（`SUPABASE_STORAGE_LIMIT_BYTES`） |

> **資料總量**：Dashboard 同時顯示「列數」與「Storage 容量」；兩者單位不同，不混加。

## C. Vercel／系統健康

| KPI | 定義 |
|---|---|
| 健康檢查 | 以 service role 對 `meow_profiles` 做 head count；記錄時間 |
| API 請求／成功率／4xx／5xx／timeout／平均時間 | 優先：本機 process 內 `recordApiMetric` 環形緩衝；可選接 Vercel Observability（需 `VERCEL_API_TOKEN`＋專案 ID；Hobby 可能無詳細 route 指標） |
| Route 分組 | `API_ROUTE_GROUPS`（貓咪、住戶、3D、健康檢查…） |

未設定 Observability 時卡片為「尚未啟用」，**不顯示假數字**。

## 環境變數（選用）

| 名稱 | 用途 |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 業務／Storage 聚合（正式站已用於其他 API） |
| `VERCEL_API_TOKEN`／`VERCEL_PROJECT_ID`／`VERCEL_TEAM_ID` | 預留 Observability |
| `HQ_DASHBOARD_WINDOW_HOURS` | 指標視窗（預設 24） |

`.env.example` 只列名稱，不放值。

## Migration

- `0023_meow_dashboard_stats.sql`：`meow_dashboard_resource_stats()`（DB 容量＋bucket 加總）
- **尚未執行時**：業務 KPI 仍可用；DB 容量／Storage 用量顯示「尚未啟用」（#222：不再遞迴掃 bucket，避免 Dashboard 逾時、首頁骨架一直閃）

## 首頁區塊（#222）

- 顯示：營運 KPI ＋ 待辦總覽
- 不顯示：「我最近的管理動作」（完整稽核仍在 Admin 授權 → 稽核日誌）
