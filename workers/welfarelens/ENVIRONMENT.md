# 環境設定與發布

MeowHome 及 WelfareLens 現階段共用私有 Azure Blob 容器 `media-dev`。早期規劃的 `media` 保留，現行流程無須移動、同步或清理資料。共用容器也包含歷史報告與真實影片。

| 變數 | 用途 | 機密 | 必填條件 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY` | 網站 Supabase 及登入 | 否 | 網站連接 Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | 網站伺服器的受控管理操作 | 是 | 需要受控管理操作 |
| `MEDIA_STORAGE`、`AZURE_STORAGE_ACCOUNT`、`AZURE_STORAGE_CONTAINER` | 網站儲存設定。Azure 使用 `azure` 與 `media-dev` | 否 | Azure 模式 |
| `AZURE_STORAGE_KEY` | 現有網站 Azure 儲存介接 | 是 | 網站 Azure 模式 |
| `AZURE_OPENAI_ENDPOINT`、`AZURE_OPENAI_DEPLOYMENT` | 模型服務與部署。Worker 與網站各自配置 | 否 | Worker 真實分析。網站依模型設定 |
| `AZURE_OPENAI_API_KEY` | Worker 或網站的模型服務憑證，各環境獨立 | 是 | 使用 Azure OpenAI |
| `MEOWHOME_PRIVATE_REPORT_VIEW` | 網站 Reader 開關。僅接受 `true` | 否 | 選填，預設關閉 |
| `MEOWHO_SUPABASE_URL`、`MEOWHO_SUPABASE_SERVICE_ROLE_KEY` | Worker 的工作佇列和 RPC | 金鑰是 | 真實領件 |
| `MEOWHO_BLOB_CONTAINER`、`WELFARELENS_MEDIA_DEV_SAS_URL` | Worker 目標容器與 SAS。SAS 空白時使用 VM Managed Identity | SAS 是 | 容器必填。SAS 或具備權限的 Managed Identity 擇一 |
| `AZURE_IMAGE_ENDPOINT`、`AZURE_IMAGE_DEPLOYMENT`、`AZURE_IMAGE_API_KEY` | Worker 產生改善圖 | 金鑰是 | 真實領件 |
| `ENABLE_CLOUD_ANALYSIS`、`ENABLE_IMAGE_EDITING` | Worker 執行真實分析與圖片生成 | 否 | 真實領件須兩者為 `true` |
| `MEOWHO_WORKER_TMP`、`WELFARELENS_PDF_BROWSER` | Worker 私有暫存目錄及 Chromium 執行檔 | 否 | 真實領件，Docker 預設瀏覽器已配置 |
| `WELFARELENS_PRIVATE_HTML`、`WELFARELENS_PRIVATE_REPORT_VIEW` | Worker 私有 HTML 及新版 Writer 開關 | 否 | 選填，兩者皆為 `true` 才上傳新版 JSON |
| `WELFARELENS_IMAGE_EDIT_CONCURRENCY`、`WELFARELENS_VIDEO_CONCURRENCY`、`WELFARELENS_VIDEO_MAX_RETRIES` | AI 並行及 VLM 傳輸重試 | 否 | 選填，預設 1、2、2。改圖只接受 1／2／3 |
| `MEOWHO_WORKER_POLL_MS`、`MEOWHO_WORKER_MAX_JOBS` | Worker 輪詢間隔與本次最多處理的嘗試數 | 否 | 有界輪詢須設定上限。預設間隔 10 秒 |
| `MEOWHO_WORKER_SERVICE`、`MEOWHO_QUEUE_ENABLED`、`MEOWHO_DEDICATED_QUEUE_PROJECT_REF` | 長期服務的部署模式、批准開關及已驗證獨占佇列專案 | 否 | 僅限獲准的獨占佇列。共用專案維持關閉 |
| `WELFARELENS_QUEUE_IMAGE`、`WELFARELENS_QUEUE_ENV_FILE` | Compose 映像 digest 與 VM 私有設定檔位置 | 否 | 使用 Queue Compose 時必填 |
| `GITHUB_TOKEN`、`WELFARELENS_GHCR_RELEASE` | GitHub Actions 內建權杖及 Registry 發布開關 | 權杖是 | 一般 CI 僅讀原始碼。發布工作另有套件寫入權限 |

- **Vercel** 在 Project Settings 分別管理 Production、Preview、Development。Preview 若指向共用 Supabase 或 `media-dev`，必須按同一資料環境處理。設定和授權尚未證實時，只驗證建置，勿在 Preview 上傳真實影片。Worker 變數只在 Worker 執行環境設定。
- **本機** 網站讀取 repository 根目錄的 `.env.local`。Worker 在本目錄配置被 Git 忽略的 `.env`，並透過 Node `--env-file=.env` 或 Docker `--env-file` 明確載入。一般測試使用合成 fixture，無須雲端機密。
- **Azure VM** 沿用 `$HOME/.config/welfarelens/media-dev.env`。限制檔案權限為 `600`，由獲准的操作帳號持有，在執行容器時提供 `--env-file`。核對存在及檔案權限，對必要鍵只檢查是否有非空值，對容器只回報是否為 `media-dev`。避免列出環境變數、完整容器設定或 SAS URL。
- **GitHub Actions** PR 不注入雲端金鑰。只有 `welfarelens-v*` tag 且明確開啟 `WELFARELENS_GHCR_RELEASE` 才執行發布工作。先由套件管理者核對目標套件可見性及 Actions access，再批准建立 tag。發布工作只推送映像、按 digest 讀回核對及執行離線健康檢查。VM 拉取私有映像的讀取權限獨立管理。

Vercel 的 Production 與 Preview 目標值及 VM 現行設定，需從各環境的管理介面或獲准的唯讀連線核對。

## Worker 改圖與 M6 驗收

程式預設為 `1`。正式路徑驗收通過後，受控真人環境可在 Worker 的私有環境檔明確設 `WELFARELENS_IMAGE_EDIT_CONCURRENCY=2`。在部署流量可控時可另行驗收 `3`。回退時先排空執行中的 Job，設回 `1` 或移除此設定，再重啟 Worker。

正式影片 Worker 的同一程序跨 Job 至少間隔 12 秒起送一次 Image Edit。429、HTTP 408、傳輸逾時與無法確認的回應會停止同批尚未起送的改圖，在途請求按自身期限收尾。Job 取消或租約失效時會傳遞取消訊號。改圖失敗不會自動重送，缺少必要改善圖的 Job 也不會自動重排或發布報告。現有報告 JSON、HTML、PDF 與 Queue 介面沿用原契約。

同一部署的 6 RPM 由所有 Worker、其他程序及客戶端共享。各程序只知道自己的起送時間，重啟會清除本機節流狀態；回退或切換後若不能確認最後起送時間，等部署最近 60 秒清空後再領件。多個程序同時使用時必須分開部署、集中節流或協調時段。單程序節流無法保證整個部署不超限。

M6 需另行批准真人影片、請求數、費用上限及執行時段。先確認隔離的 Supabase 佇列、獨立 Blob 前綴、單一 Worker 與可控制的模型流量；以 `1` 執行一份測試 Job，核對 Claim、Lease、Attempt、Complete、Owner 存取及每個案例的 PNG 對應，驗證 JSON、HTML、PDF 均可讀取。真人測試再以 `2` 依序送入三個測試戶各一份，核對每筆起送至少隔 12 秒（含跨 Job）、沒有 429 或意外重試、各戶只能存取自己的報告。監控使用次數與 Usage；遇到租約失效、429、逾時、未知回應或產物契約失敗即停止。用隔離替身驗收 lease／重啟與停止邏輯；正式設定回退到 `1`，既有 reports 不需遷移。
