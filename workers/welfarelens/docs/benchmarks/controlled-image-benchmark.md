# WelfareLens M4 固定輸入改圖實驗

## 原始資料與可重現條件

2026-11-19 的完整 Pipeline Pilot 為 A 306.099 s、B 225.942 s。當時兩輪分別改 6／5 件，輸入與提示有差異。本次使用歷史 **A 組全部六件**，順序沿用 `after.png`、`after-2.png` 至 `after-6.png`。六個請求含五張不同影格，其中同一張 f065 有兩個不同目標，保留原有案例與提示。這份工作負載描述的是既有模型行為，實驗接受原先提示的內容。

`freeze-controlled-image-benchmark.ts` 檢查 RC.1 的 Commit 與 Registry Digest、已完成兩輪的請求帳本、原圖及輸出、原始設定與提示 SHA-256，再以不可覆寫方式輸出 Frozen Manifest 與五份按雜湊命名的 JPEG。API 版本從 RC.1 的 `/openai/v1/images/edits` 客戶端確認。原始 Prompt 依模型請求的完整字串重新送出，JSON 跳脫會還原；multipart boundary 是每次產生的傳輸封裝，可變。真正控制的是每個表單欄位與檔案內容。資料包含私人影像及提示，應放在只有操作者可存取、Git 外的資料夾，執行時只讀掛載。之後的正式核准檔須固定 manifest 整檔 SHA-256，兩輪共用同一份。

## 程式路徑

- `src/domain/scan-result.ts`、`src/server/video/visual-cases.ts` 與 `before-after.ts` 是歷史正式 Pipeline 的 VLM 候選、可視化選案、Prompt 組裝。受控模式從凍結資料開始。
- `src/server/video/image-edit-pool.ts` 由正式報告與受控工具共用。保留原有正式預設。索引在 await 前遞增，輸出依原始索引保存。
- `src/server/image-edit-client.ts` 負責 multipart、180 秒呼叫中止訊號的傳遞、有界 JSON 收取與 PNG 檢查。單次 image client 無自動重試。
- `src/server/video/benchmark-guard.ts` 以獨占鎖、共享節流、持久預留及輸出核准控制實驗。受控策略每輪最多六件、共兩輪、VLM 為零。核對每一次 payload，錯誤、429 或未知回應都會關閉後續新 dispatch，已在途的請求仍保留預留。
- `scripts/controlled-image-benchmark.ts` 記錄排隊、領取索引、回應解析、圖片解碼驗證、結果 SHA-256、Usage 與成本估算。A 的驗收檔和六個 PNG 均需通過雜湊檢查，B 才放行。

## 本機執行

由乾淨的測試分支建置獨立的 Linux AMD64 映像。以下為 PowerShell 操作，請把私有路徑變數設成自己的目錄。

```powershell
$rev = git rev-parse HEAD
docker build --platform linux/amd64 --label "org.opencontainers.image.revision=$rev" -f workers/welfarelens/Dockerfile.worker -t "welfarelens-worker:controlled-$($rev.Substring(0,12))" workers/welfarelens
$image = docker image inspect --format '{{.Id}}' "welfarelens-worker:controlled-$($rev.Substring(0,12))"
docker run --rm --network none --pull never $image --self-test
```

凍結一次。在個人可存取的私有目錄建立空的父資料夾，將歷史 Pilot 根目錄以唯讀方式掛載。 `$caseDir` 是 A 組 `batch/run-1` 底下唯一的 UUID 目錄名稱。

```powershell
docker run --rm --network none --pull never --mount "type=bind,src=$pilot,dst=/pilot,readonly" --mount "type=bind,src=$private,dst=/private" --entrypoint node $image --experimental-strip-types scripts/freeze-controlled-image-benchmark.ts --pilot /pilot --run-a $caseDir --output /private/frozen
```

乾跑為同一批兩輪，使用獨立空目錄 `$dryBatch`。啟動器核對本機 Docker、Linux AMD64、Image ID 及 OCI Revision，並指定 `--network none`。容器只用固定合成回應，仍走正式 client、共用 guard 和 FFmpeg 圖片驗證。

```powershell
node workers/welfarelens/scripts/run-controlled-image-benchmark.mjs --image $image --commit $rev --frozen "$private/frozen" --batch $dryBatch --run 1 --dry-run
node workers/welfarelens/scripts/run-controlled-image-benchmark.mjs --image $image --commit $rev --frozen "$private/frozen" --batch $dryBatch --run 2 --dry-run
```

真實執行另需新增 US$9／12 次的明確批准，確認 Sunburst 部署版本、配額、費率及共用部署時段。之前的 Pilot 預留 US$16.25 保留，合計預留曝險至少 US$25.25。歷史同款六件 Usage 推估一對約 US$0.55，實際計費仍須對帳。

批准到位才在私有 `$approval` JSON 寫入 `approvalRef`（可追溯授權編號）、`commit`（完整新測試 SHA）、`imageId`、`manifestSha256`、`approvedUsdMicros: 9000000`，並另建空的 `$liveBatch`。 `$azureEnv` 指向既有本機私有 Azure 環境檔，啟動器只傳三個 `AZURE_IMAGE_*` 設定。模型及部署要和 manifest 一致。先執行第一條，驗收結果後才執行第二條。

```powershell
node workers/welfarelens/scripts/run-controlled-image-benchmark.mjs --image $image --commit $rev --frozen "$private/frozen" --batch $liveBatch --run 1 --approval $approval --azure-env $azureEnv
node workers/welfarelens/scripts/run-controlled-image-benchmark.mjs --image $image --commit $rev --frozen "$private/frozen" --batch $liveBatch --run 2 --approval $approval --azure-env $azureEnv
```

失敗保留帳本、案例狀態與輸出。真實回應缺少計價用量，或單次用量估算超過預留額時，一併停止。這個停止規則不能回溯阻止已完成的計費。程序異常中斷時保留獨占鎖，需先對帳，禁止清空或改目錄進行未批准重試。真實執行範圍只含圖片編輯，零 VLM、零資料庫作業、零 Blob 上傳。

## 結果如何判讀

| 指標 | 證據 |
|---|---|
| Wall Time | `run-N.json.wallMs`，第一批案例排入至全部完成／驗證。 |
| 排隊與節流 | `assignedMs - enqueuedMs` 是等候工位，`requests.waitMs` 包含傳輸 guard 排隊及節流。 |
| 網路與解析 | `dispatchAtMs` 與 `headerAtMs` 為實際起送、收到標頭的時間戳。 `throughHeadersMs` 以單調時鐘量測。 `parsedMs` 是解析／回應處理結束相對時間，`finishedMs` 另含本機寫入與驗證。 |
| 在途重疊與速率 | `overlapMs` 計算同時有至少兩個 dispatch-to-header 區間的時間。用個別耗時、節流及重疊判斷瓶頸。 |
| 總體比較 | B 的 `pair` 記錄節省毫秒數、加速比與耗時降幅。 `actualBilledUsd` 保持 null，估算按歷史公告輸入／輸出費率及 Usage。離線輸出只用來驗證程式。 |

2026-11-19 真實 A/B 一對的 Wall Time 為 191.706／115.925 秒，六件皆成功。單對結果只代表該工作負載及部署時段，不可外推為完整 Pipeline 的加速比例。

## 六輪並行比較

沿用同一份 Frozen Manifest。加入 `--six-round` 後，固定順序為 2、3、4、4、3、2。每輪六件，零 VLM，跨輪沿用同一份帳本記錄的最後起送時間。這個模式要求部署為 6 RPM、最小起送間隔設定為 12,000 ms。正式 Worker 的並行設定仍只接受 1／2。

使用新映像與全新的私有乾跑目錄，於啟動器加入 `--six-round --dry-run`。逐輪確認成功才繼續。主機以 `--network none` 啟動並拒絕在乾跑模式提供憑證或批准檔。

真實六輪需另外取得 **US$27／最多 36 次請求**與 Sunburst 共用時段的批准。持久帳本保留 US$25.25 歷史預留曝險，新批次最多新增 US$27。預留是本機請求控制，Azure 實際費用另行對帳。

在核准後，於私有批准檔沿用上述身分欄位，改填 `approvedUsdMicros: 27000000`，加入 `study: "concurrency-234"` 及 `batchPathSha256`。後者是下列命令輸出的標準化主機目錄雜湊，批准檔三十六次配額只供該批次路徑使用。

```powershell
node --input-type=module -e 'import {realpathSync} from "node:fs"; import {createHash} from "node:crypto"; console.log(createHash("sha256").update(realpathSync(process.argv[1])).digest("hex"))' -- $liveBatch

node workers/welfarelens/scripts/run-controlled-image-benchmark.mjs --image $image --commit $rev --frozen "$private/frozen" --batch $liveBatch --run 1 --six-round --approval $approval --azure-env $azureEnv
```

逐輪檢視 `ok`、六件 PNG、請求結果與預留額後，才將 `--run` 依序改為 2 至 6。每輪放行前會驗證前一輪的案例、原圖／提示雜湊與輸出雜湊，並核對所有已完成輪次的帳本。遇到 429、逾時、中止、未知回應或費用異常，停止整批並保留證據。

每輪保存 `slotWaitMs`、`throttleWaitMs`（guard 總等待，含排隊）、`pacingSleepMs`（已起送請求的節流等待）及 `inFlightMs`（依同時在途數分組的 dispatch-to-header 時間）。各等待總和可能在時間上重疊，不可加總成 Wall Time。用每組兩輪的 Wall Time、中位數、最慢值、成功率、請求錯誤及最高在途數判斷差異。六輪實測與雲端費用目前待獨立驗收。
