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

1. 在隔離的 Supabase 專案與網站 Preview 建立兩個測試帳號，配置專用 Azure 儲存帳戶下的私有 `media-dev`，使用測試喵戶的 `homes/<household_id>/` 前綴。預檢網站與 Worker 的專案 ID、容器、前綴、Blob 存取、模型部署與服務身分。只核對設定及權限，不記錄機密。
2. 用手機以 Owner 上傳經同意或擺拍的影片，包含至少兩個可獨立驗證的改善案例。確認隔離佇列只有這筆可領取且沒有競爭 Worker。使用上方 `--once`，從私有設定省略改圖並行數，驗證啟動值為 2。測試可顯式設 `WELFARELENS_VIDEO_MAX_RETRIES=0`，避免 VLM 重試增加請求數。
3. 擬議硬上限為 VLM 14 次（8 格加最多 6 次植物複查）、改圖 8 次。須在批准前以隔離模型出口在實際起送前計數並限制花費，含失敗與結果不確定的嘗試。正式 Worker 尚無每 Job 的改圖硬上限，既有 Benchmark 帳本只適用於 Benchmark。現有 profile 的 `image_edit_request` span 含節流等待，另記實際模型出口起送與結束的單調時鐘時間以核對間距與重疊。
4. 以[歷史用量與公告價試算](./docs/benchmarks/2026-11-pipeline-performance.md) 為參考：先前同類單輪約 US$0.50–0.55；依 14＋8 次工作負載約 US$1.37。按同份文件的每次預留估算，建議送審 US$13 模型預留（14 × US$0.50 ＋ 8 × US$0.75），VM 和 Blob 另計。這些金額需依實際 SKU、使用量及當前費率核對，並非帳單上界。
5. 保存單筆 Claim、Lease、Attempt、Complete、模型請求時間／用量與結果檢核。兩次起送須相隔至少 12 秒；只有請求實際重疊才算驗證在途雙路。比對各案例證據及圖片，驗證 JSON、HTML、PDF，並由隔離測試戶確認 Owner 可讀及另一帳號被拒絕。遇到 429、逾時、Abort、未知回應、租約失效、超出預算或觀測不到起送時停止。用斷網替身注入失敗，驗證不錯誤發布或重排；不要用付費請求製造故障。

## A/B 驗收

使用完整且經授權的 `cleanroom.mp4`。同一映像 digest、模型版本與 SKU、8 格、VLM 並行 2、固定提示詞與圖片品質。輪流執行圖片並行 1 及 2，各三次。從 `welfarelens_job_profile` 記錄各階段延遲及重試，另核對 Azure Usage、VM 資源與實際請求量。人工檢視每個對照案例、證據框與可信度，並比對 JSON 契約、完整 HTML、PDF 與圖片。

六輪測試關閉 VLM 傳輸重試後，最多 84 次 VLM 請求（每輪 8 格加最多 6 個植物複查）。圖片沒有固定案例上限，48 次僅為擬議的驗收上限，須先落實基準測試的請求預算閘門。將最後一輪 B 作為第一戶，再增兩戶時，建議總上限 112 次 VLM、64 次圖片與 US$40。核對實際模型、區域、SKU、大小、品質及計價後才可批准費用。達上限時停止測試，保留不完整結果供診斷。

歷史參考約 8 分 34 秒。比較 A、B 的處理時間中位數，另列排隊等待與最慢一輪。第一目標 6 分鐘，挑戰目標 4 分鐘。只有證據與產物品質一致，且費用、429、Timeout 或重試未造成不可接受差異，才成立。
