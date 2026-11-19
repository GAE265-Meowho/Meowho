# Azure VM Worker 操作

## 私有 GHCR 發布（#519）

發布者從已通過 CI 的 main 提交建立尚未使用的 `welfarelens-v*` Tag，並先確認 `WELFARELENS_GHCR_RELEASE=true`。團隊應限制可建立發布標籤的人員，並維持 GHCR Package 為 Private。發布工作會在建置前確認提交已進入 main。一般 PR 和 main CI 只具備 `contents: read`，只有符合發布條件的 Tag 工作可使用 `packages: write`。

發布工作在同一 runner 內建置 Linux AMD64、測試並推送同一個本機 Image ID。以 Actions 摘要列出的 GHCR Digest、Image ID 和 OCI Revision 驗收。完整映像封存檔只可由授權的人員在私有環境製作與傳輸，勿上傳公開 repo 的 Actions Artifacts。既有 Tag 的重跑仍會使用當時的 Workflow，請勿重跑舊版發布流程。

## 離線驗證及回復

從 `workers/welfarelens/` 操作。更新前記下現行映像的完整 digest 或本機 ID、容器名稱及啟動參數。保留上一版本。在獲准的測試 VM 核對新映像：

```sh
docker pull "$WELFARELENS_QUEUE_IMAGE"
docker run --rm --network none "$WELFARELENS_QUEUE_IMAGE" --self-test
```

離線備援使用 `docker save`，以 SHA-256 核對檔案後 `docker load`，再以完整本機 image ID 驗證。原本的執行設定檔位於 `$HOME/.config/welfarelens/media-dev.env`，沿用 Docker `--env-file`。`stat -c '%a' "$HOME/.config/welfarelens/media-dev.env"` 應回報 `600`。

## 領件與停止

`meow_env_claim(p_worker)` 使用 `queued_at` 與 `FOR UPDATE SKIP LOCKED`，可接手租約逾期的工作。續租、完成與失敗回報由既有 RPC 檢查租約、attempt 及工作狀態。容器 `media-dev` 共用，RPC 無原子 Job ID 或環境篩選。即使設 `MEOWHO_WORKER_MAX_JOBS=1`，其他入列工作仍可能先被領取。

共用佇列維持人工受控模式。經批准後先暫停其他上傳入口與競爭 consumer，再重查待領 queued 和過期 lease 清單。獲准 Job ID 清單需要符合所有可領工作，且管制需持續到 Worker 停止。若無法管制入列，延後真實驗收。預設的常駐服務檢查會拒絕團隊共用專案，本次也不建立新專案。若日後需在共用專案同時處理非測試工作，先另行審核以指定 Job ID 限定的原子 claim 方案，保留既有函式相容性。

確認管制、費用和上傳來源後，先採單次執行。以下指令會真正領件，平時只執行前節離線檢查。

在私有環境檔省略 `WELFARELENS_IMAGE_EDIT_CONCURRENCY` 時使用雙路。以啟動日誌的 `image_edit_concurrency` 核對實際值；同一程序跨 Job 起送間隔至少 12 秒。要回退先停止領件，待在途工作收尾，再顯式設為 `1` 後重啟。共享 6 RPM 時先協調用量，無法確認最後起送時間時須等部署最近 60 秒清空。

```sh
docker run --name welfarelens-approved-attempt --restart no \
  --env-file "$HOME/.config/welfarelens/media-dev.env" \
  --tmpfs /data:uid=1000,gid=1000,mode=0700 \
  -e MEOWHO_BLOB_CONTAINER=media-dev -e MEOWHO_WORKER_TMP=/data \
  -e WELFARELENS_PRIVATE_HTML=true -e WELFARELENS_PRIVATE_REPORT_VIEW=true \
  --entrypoint node "$WELFARELENS_QUEUE_IMAGE" \
  --experimental-strip-types scripts/meowho-worker.ts --once
```

三戶驗收逐戶核對 Owner、來源影片、attempt、結果歸屬及無跨戶讀取。另以獲准的隔離佇列與無付費 fixture 測試停止、重新啟動、lease 恢復與舊 attempt 拒絕。獨占佇列已驗證時才可用 `bash scripts/queue-service.sh verify` 和 `start`，以及以 `stop` 停止。回復先停止候選 Worker，確認未留下競爭 consumer，再以先前 digest 與原設定啟動核准版本。保留歷史輸出，不重排未核准工作。網站端 Reader 可獨立關閉並回到 HTML。

### M6 首筆真人工作

1. 管理員先提供已隔離的 Supabase 專案、相同專案的受保護網站 Preview、兩個測試帳號及專用 Azure 儲存帳戶下的私有 `media-dev`。核對 Preview 的 `NEXT_PUBLIC_SUPABASE_URL`、伺服器服務角色、`MEDIA_STORAGE=azure`、儲存帳戶與容器、Preview 網域的上傳 CORS 與報告旗標。核對 Worker 的專案網址、專用專案 ref、儲存帳戶與容器、測試身分權限及模型部署。只記錄安全的識別資訊與核對結果。
2. 使用經同意的擺拍 MP4／MOV，包含至少兩個有各自可見證據且可安全模擬的改善案例。Owner 用手機走主站影片上傳與 3D 房間送出流程。送出會一起建立 Room Job，驗收期間保留未處理。由管理員關閉其餘測試入列及確認無競爭 consumer，核對影片、喵戶、Job 和 Report ID。以唯讀方式確認唯一可領取項目是指定、尚未嘗試的 queued Job，且沒有逾期租約。M6 會在 Claim 回傳後檢查 Job ID 和 attempt；若不符，立即停止且不觸碰 Blob。這項檢查仍晚於 Claim，必須有獨占佇列及入列管制。
3. 使用同時包含 M4 與 M6 的已審查 Commit。驗證本機映像 ID 或獲准的私有 GHCR digest、OCI Revision、Linux AMD64 及斷網 Self-test。若採本機 Docker，VM 維持解除配置，私有環境檔需要有效且已隔離的 SAS。以下為授權後的 PowerShell 指令，使用管理員已填好的變數與目錄。先確認 `$M6AuditDir` 是本次核准的 Git 外持久目錄，容器能寫入，且沒有舊的 `model-requests.jsonl`。環境檔必須設定 `MEOWHO_DEDICATED_QUEUE_PROJECT_REF` 並省略 `WELFARELENS_IMAGE_EDIT_CONCURRENCY`。

   ```powershell
   docker image inspect $M6Image --format '{{.Id}} {{.Os}}/{{.Architecture}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
   docker run --rm --pull never --network none $M6Image --self-test
   docker run --name welfarelens-m6-once --restart no --pull never --platform linux/amd64 `
     --env-file "$M6EnvFile" --mount "type=bind,source=$M6AuditDir,target=/audit" `
     --tmpfs /data:uid=1000,gid=1000,mode=0700 `
     -e MEOWHO_BLOB_CONTAINER=media-dev -e MEOWHO_WORKER_TMP=/data `
     -e WELFARELENS_PRIVATE_HTML=true -e "MEOWHO_M6_JOB_ID=$M6JobId" `
     -e MEOWHO_M6_MODEL_LEDGER=/audit/model-requests.jsonl `
     --entrypoint node $M6Image --experimental-strip-types scripts/meowho-worker.ts --once
   docker inspect welfarelens-m6-once --format '{{.State.Status}} {{.State.ExitCode}}'
   ```

4. 模型出口在每次起送之前寫入並同步持久帳本。上限為 VLM 14 次和改圖 8 次，含非 2xx、逾時及結果不確定的請求。測試模式強制關閉 VLM 重試及失敗重排。每次 VLM 預留 US$0.50，改圖 US$0.75，累積最多 US$13。依[歷史工作負載與公告價](./docs/benchmarks/2026-11-pipeline-performance.md)試算約 US$1.37，實際費用以部署 SKU、Usage 及帳單為準。US$13 是預留硬上限，Azure 帳單上界未經證明。Blob 傳輸與交易另外計費，本機 Docker 不需 VM 運算費。
5. 核對啟動日誌 `image_edit_concurrency=2`。帳本中的 `dispatch_ms` 是程序內單調時間，`response` 表示收到 HTTP 回應標頭；`in_flight_at_dispatch` 可證明標頭前重疊。影像回應完整性、延遲及模型用量另用 Worker profile 和產出檔核對。若間隔不足 12 秒、可用案例少於兩件，或沒有觀察到重疊，分別記為失敗或未觀察到。核對 Claim、Renew 與 Complete 及同一 attempt 的 JSON／HTML／PDF、裁切與 Before／After、Owner 讀取和另一帳號被拒絕。以各 Blob 檔案存在且可解析及網站可讀取為成功條件；有必要時讓測試素材及工作時間足以觸發續租，否則續租另列未觀察到。
6. 隔離／權限不一致、模型非 2xx、逾時、Abort、未知結果、租約失效、超出限額、帳本失效或必要產物缺漏時停止。必要時用 `docker stop -t 30 welfarelens-m6-once`，保留帳本及測試產物，不重啟同一輪、不換帳本、不重新排隊。失敗時可能在該 attempt 前綴留下部分檔案，未成功 Complete 的結果不得對外驗收。確認容器已退出後，依測試資料保留政策由管理員清除測試喵戶資料與該前綴，保留去識別驗收結果；清除資料需另行核准。

若目前沒有隔離佇列，最小作法是由管理員提供既有測試專案，補齊 Preview、儲存與測試帳號；開發端約半天核對及離線準備，權限、部署與資源交付時間另計。若暫時無法取得，可在另行批准後用本機有界 Pipeline 執行器驗證模型與完整報告，停在本機產物。此替代方案不驗證手機上傳、Claim／Lease、Blob 或網站授權。

## A/B 驗收

使用完整且經授權的 `cleanroom.mp4`。同一映像 digest、模型版本與 SKU、8 格、VLM 並行 2、固定提示詞與圖片品質。輪流執行圖片並行 1 及 2，各三次。從 `welfarelens_job_profile` 記錄各階段延遲及重試，另核對 Azure Usage、VM 資源與實際請求量。人工檢視每個對照案例、證據框與可信度，並比對 JSON 契約、完整 HTML、PDF 與圖片。

六輪測試關閉 VLM 傳輸重試後，最多 84 次 VLM 請求（每輪 8 格加最多 6 個植物複查）。圖片沒有固定案例上限，48 次僅為擬議的驗收上限，須先落實基準測試的請求預算閘門。將最後一輪 B 作為第一戶，再增兩戶時，建議總上限 112 次 VLM、64 次圖片與 US$40。核對實際模型、區域、SKU、大小、品質及計價後才可批准費用。達上限時停止測試，保留不完整結果供診斷。

歷史參考約 8 分 34 秒。比較 A、B 的處理時間中位數，另列排隊等待與最慢一輪。第一目標 6 分鐘，挑戰目標 4 分鐘。只有證據與產物品質一致，且費用、429、Timeout 或重試未造成不可接受差異，才成立。
