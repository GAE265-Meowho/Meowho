# M6 本機完整 Pipeline

沿用 `run-pipeline-benchmark.mjs` 與正式影片分析核心。指定 `--m6-local` 後，無核准編號時只執行斷網預檢。單筆實測共用 M6 的一次性 JSONL 帳本與正式改圖節流，使用預設雙路、至少 12 秒起送間隔、VLM 零次傳輸重試。VLM 和改圖各保留 14／8 次，每次預留 US$0.50／US$0.75，總預留最多 US$13。Azure 實際帳單須另行對帳。

## 私有批次與預檢

用經授權的 MP4／MOV，最多 300 MB、最長 180 秒。畫面應包含至少兩個可見且能安全示意的獨立改善案例。離線可檢查檔案格式與影格解碼，案例是否被真實模型選中要由實測確認。

建立一個 Git 外、僅操作者可讀寫的目錄 `$M6Batch`。將允許的六個 Azure 模型設定存於 Git 外的 `$M6AzureEnv`，即 `AZURE_OPENAI_ENDPOINT`、`AZURE_OPENAI_DEPLOYMENT`、`AZURE_OPENAI_API_KEY` 與對應的三個 `AZURE_IMAGE_*` 設定。預檢使用替代金鑰及 Docker `--network none`。Launcher 只傳這六項，請使用可信的本機 Docker，因為執行中有 Docker 管理權限者仍可檢視環境。

從 repository 根目錄以 PowerShell 執行。先設定 `$M6Batch`、`$M6Video`、`$M6AzureEnv` 為上述現有的絕對路徑。

```powershell
$M6Commit = git rev-parse HEAD
if (git status --porcelain) { throw 'Use a clean candidate commit' }
docker build --platform linux/amd64 --label "org.opencontainers.image.revision=$M6Commit" -f workers/welfarelens/Dockerfile.worker -t welfarelens-worker:m6-local workers/welfarelens
if ($LASTEXITCODE) { throw 'Build failed' }
$M6Image = docker image inspect welfarelens-worker:m6-local --format '{{.Id}}'
docker run --rm --pull never --network none $M6Image --self-test
if ($LASTEXITCODE) { throw 'Self-test failed' }
```

在 `$M6Batch/approval.json` 填寫下列欄位。Host 與 Deployment 取自本次核對的模型設定，版本使用 Azure 管理面顯示的版本，正式執行前再核對一次。預檢可用候選核准編號，之後只有收到實際付款與影片授權才可用該編號起送。

| 欄位 | 值 |
| --- | --- |
| `approvalRef` | 本次單筆測試的唯一核准編號 |
| `commit` | `$M6Commit` |
| `imageId` | `$M6Image` |
| `inputSha256` | `(Get-FileHash $M6Video -Algorithm SHA256).Hash.ToLowerInvariant()` |
| `vlm` | 物件，含 `host`、`deployment`、`version` |
| `image` | 物件，含 `host`、`deployment`、`version` |

```powershell
$M6Args = @('--m6-local', '--config', (Join-Path $M6Batch 'approval.json'), '--input', $M6Video, '--batch', $M6Batch, '--azure-env', $M6AzureEnv)
node workers/welfarelens/scripts/run-pipeline-benchmark.mjs @M6Args
```

## 單筆執行與驗收

確認使用者批准影片、唯一批次、最多 14 次 VLM／8 次改圖與 US$13 預留。管理員確認測試時段與共用模型流量，再以同一份輸入與核准資料執行一次。若近期部署起送時間不確定，開始前至少等一個完整的 60 秒配額窗口並重新核對流量。

```powershell
node workers/welfarelens/scripts/run-pipeline-benchmark.mjs @M6Args --m6-approval $M6Approval
```

即使中斷，保留同一批次與 `model-requests.jsonl`。429、逾時、取消、未知或不可用的回應、帳本或額度異常時停止起送，已在途的請求仍可能在 Azure 計費。不要刪帳本、換目錄或重新起送同一次授權。需要手動停止時，從另一個終端執行 `docker stop -t 30 welfarelens-m6-local`，等容器退出後核對私有帳本與 Azure Usage，再決定是否另行授權。

成功後讀取批次內 `run-1.json`。以 `artifacts` 取得相對資料夾，在本機直接開啟 `report.html` 與 `report.pdf`，保留同目錄的 `html-assets/`。同資料夾留有影格、分析結果、改善圖與案例對應、`result.json`、`report-view.json`。核對報告至少兩個合格案例、報告顯示範圍、Usage、圖片 SHA-256 及各階段耗時。帳本的在途峰值計至 HTTP 回應標頭。影片若沒有足夠重疊條件，將重疊記為未觀察到。失敗時保留中間資料作診斷，勿把不完整檔案拿來展示。
