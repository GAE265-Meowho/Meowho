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
| `WELFARELENS_IMAGE_EDIT_CONCURRENCY`、`WELFARELENS_VIDEO_CONCURRENCY`、`WELFARELENS_VIDEO_MAX_RETRIES` | AI 並行及 VLM 傳輸重試 | 否 | 選填，預設 1、2、2 |
| `MEOWHO_WORKER_POLL_MS`、`MEOWHO_WORKER_MAX_JOBS` | Worker 輪詢間隔與本次最多處理的嘗試數 | 否 | 有界輪詢須設定上限。預設間隔 10 秒 |
| `MEOWHO_WORKER_SERVICE`、`MEOWHO_QUEUE_ENABLED`、`MEOWHO_DEDICATED_QUEUE_PROJECT_REF` | 長期服務的部署模式、批准開關及已驗證獨占佇列專案 | 否 | 僅限獲准的獨占佇列。共用專案維持關閉 |
| `WELFARELENS_QUEUE_IMAGE`、`WELFARELENS_QUEUE_ENV_FILE` | Compose 映像 digest 與 VM 私有設定檔位置 | 否 | 使用 Queue Compose 時必填 |
| `GITHUB_TOKEN`、`WELFARELENS_GHCR_RELEASE` | GitHub Actions 內建權杖及 Registry 發布開關 | 權杖是 | 一般 CI 僅讀原始碼。發布工作另有套件寫入權限 |

- **Vercel** 在 Project Settings 分別管理 Production、Preview、Development。Preview 若指向共用 Supabase 或 `media-dev`，必須按同一資料環境處理。設定和授權尚未證實時，只驗證建置，勿在 Preview 上傳真實影片。Worker 變數只在 Worker 執行環境設定。
- **本機** 網站讀取 repository 根目錄的 `.env.local`。Worker 在本目錄配置被 Git 忽略的 `.env`，並透過 Node `--env-file=.env` 或 Docker `--env-file` 明確載入。一般測試使用合成 fixture，無須雲端機密。
- **Azure VM** 沿用 `$HOME/.config/welfarelens/media-dev.env`。限制檔案權限為 `600`，由獲准的操作帳號持有，在執行容器時提供 `--env-file`。核對存在及檔案權限，對必要鍵只檢查是否有非空值，對容器只回報是否為 `media-dev`。避免列出環境變數、完整容器設定或 SAS URL。
- **GitHub Actions** PR 不注入雲端金鑰。只有 `welfarelens-v*` tag 且明確開啟 `WELFARELENS_GHCR_RELEASE` 才執行發布工作。先由套件管理者核對目標套件可見性及 Actions access，再批准建立 tag。發布工作只推送映像、按 digest 讀回核對及執行離線健康檢查。VM 拉取私有映像的讀取權限獨立管理。

Vercel 的 Production 與 Preview 目標值及 VM 現行設定，需從各環境的管理介面或獲准的唯讀連線核對。
