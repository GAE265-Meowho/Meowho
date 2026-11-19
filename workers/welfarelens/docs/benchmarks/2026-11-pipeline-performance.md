# WelfareLens 影片分析效能驗收

**狀態：已準備離線工具。真實 Pilot、六輪計時、計費、品質審查與並行決策均待測。**

## 問題與比較對象

MeowHome 正常路徑是 Supabase 領件 → Azure Blob 下載 → FFmpeg 抽影格 → VLM 分析與植物補查 → 風險彙整 → AI 改圖 → HTML／JSON／PDF → 上傳 → 完成回寫。歷史單筆雲端流程約 8 分 34 秒，當次各階段分解待測，不能直接當成這次比較的 A 組。

A 維持逐案改圖。B 允許兩個獨立案例同時進行，仍按原順序保留輸出和來源關聯。若上一個改圖請求尚未結束且已到下個安全發送時間，B 可重疊等待。若主要耗時在節流、VLM 或報告渲染，收益可能很小。兩組使用同一映像、模型、提示詞生成規則、八影格抽樣、兩路 VLM、固定價目與節流、`n=1`、`size=auto`、`quality=high` 和 PNG。沒有刪減案例來滿足配額。超額的輪次視為失敗。

## 版本與執行環境

| 項目 | 紀錄 |
| --- | --- |
| 主線基準 | `656c4e705f9ab058387163e58278ff3718c5f4bf`，PR #496 合併提交 |
| Benchmark Commit、Linux AMD64 Docker Digest、Image ID、OCI revision label | 待測。更新前需比對實際測試映像與 Commit |
| 真實開始／結束日期、執行主機、CPU／RAM | 待測 |
| 影片 | 授權測試用 `cleanroom.mp4`，本機 ffprobe 查得 H.264，111.325 秒，720 × 1280，29,326,000 bytes |
| 來源影片 SHA-256、八個時間戳記、案例及圖片數 | 影片 Hash 於私有核准設定中固定。其餘待測 |
| VLM | 本機設定對應 `gpt-6.1-terra`，版本 `2026-10-26`，GlobalStandard，2,000 RPM／2,000,000 TPM。Azure 控制面唯讀核對 |
| 改圖 | 本機設定對應 `gpt-image-2.5-sunburst`，版本 `2026-09-08`，GlobalStandard，6 requests／60 秒。Azure 控制面唯讀核對 |
| 配額共享與時窗 | 呼叫者歸屬及可用餘裕待確認。由部署管理者保留測試時段，避免其他服務耗盡配額 |
| 計費 | 帳戶有效價目、每次最壞計費量、實際逐輪成本待核對。US$10 Pilot、US$40 全批僅為提案上限，未核准 |

[合併後 Worker CI](https://github.com/GAE265-Meowho/Meowho/actions/runs/44436327751) · [合併後網站 CI](https://github.com/GAE265-Meowho/Meowho/actions/runs/44436327480)

## 執行與重現

1. 在單一本機或專用 VM 建立專案外、只有操作者可讀寫的批次目錄。Windows 使用限本人存取的 ACL，Linux 使用 `umask 077`。持久掛載同一批次目錄，使用本機磁碟。影片與部屬核准設定唯讀掛載。原始 trace、影片、完整報告、圖片、計費明細、環境檔及身分資訊均留在私有目錄。
2. 在私有 `approval.json` 記錄 `approvalRef`、`commit`（40 字元）、`digest`（`sha256:…`）、`inputSha256`、`pilotUsdMicros`、`batchUsdMicros`，以及 `vlm`、`image` 各自的 `host`、`deployment`、`version`、`sku`、`confirmedRpm`、`gapMs`、`reserveUsdMicros`。一美元等於 1,000,000 micros。版本、配額與預留額由操作者依控制面及計價文件確認。程式會比對本機載入的實際 host 和 deployment，並檢查每次送出的 model。核准編號是工程追溯資料，並無外部審批驗證。
3. 費用由「可證明的單次最壞計價」核算成預留額。VLM 須考慮影像／文字輸入、最長回覆及有效費率，改圖須考慮輸入圖、提示詞與 `auto/high` 所能產生的最壞輸出。以未快取價計算，失敗、逾時及未知請求一律保留全額。尚無法證明單次預留額足以涵蓋實際帳單時，維持阻擋。公開價目可用作交叉檢查，實際帳戶費率仍須核對。
4. 每輪硬上限 VLM 14 次與改圖 8 次。Pilot 最多 28／16，六輪合計最多 84／48。預檢以最大包絡核對兩輪和六輪預算。每一個 dispatch 落地並同步寫碟後才呼叫 Azure。批次目錄有獨占鎖，重跑相同輪次會拒絕，Crash 之後保留鎖供對帳。勿清空或複製目錄來繼續測試。A、B 共享同一套限流演算法與兩輪間的間隔狀態。改圖至少間隔 12 秒，每分鐘最多五次本批次起送，並可拉長間隔。遇 429 停止新請求，已送出者可能計費。VLM 本次停用傳輸重試，Pipeline 未通過會停止後續輪次。
5. 使用固定 digest，先用 `docker image inspect` 核對 Linux/amd64、OCI revision、Image ID，再用 `docker run --rm --network none "$IMAGE" --self-test`。先以 `--preflight` 確認 FFmpeg、輸入摘要、部署和預算，不送出模型請求。

Linux Shell 範例。參數來自操作者自己的已驗證設定，`AZURE_ENV` 內只需 Azure AI 憑證，不掛載 Supabase 或 Blob 憑證。私有掛載的 Unix UID 需能寫入 `BATCH`。將 Docker 的 stdout/stderr 保存於受限目錄。

```sh
# IMAGE 格式為 $registry_path@sha256:$verified_digest
docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE"
run_benchmark() {
  docker run --rm --env-file "$AZURE_ENV" --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$BATCH,dst=/batch" \
    --mount "type=bind,src=$VIDEO,dst=/tmp/cleanroom.mp4,readonly" \
    --mount "type=bind,src=$APPROVAL,dst=/tmp/approval.json,readonly" \
    --entrypoint node "$IMAGE" --experimental-strip-types scripts/pipeline-benchmark.ts \
    --config /tmp/approval.json --input /tmp/cleanroom.mp4 --batch /batch "$@"
}
run_benchmark --preflight
# Pilot 明確核准後才執行。任一輪失敗即停並對帳。
run_benchmark --phase pilot --run 1 && run_benchmark --phase pilot --run 2
# 比對 Pilot 產物、成本及配額，取得第二次核准後逐輪執行 3、4、5、6。
run_benchmark --phase remaining --run 3 --expansion-approval "$EXPANSION_APPROVAL"
# 在有原始碼的主機從私有原始紀錄重算 Markdown，審查後才公開。
node scripts/summarize-pipeline-benchmark.mjs "$BATCH"
```

順序為 **A、B、B、A、A、B**。每輪完整重跑 VLM，不使用其他輪次的 AI 結果。使用者若只授權 Pilot，停在第二輪。

## 原始數據與統計

私有 `requests.jsonl` 記下 dispatch、起送間隔、節流等待、到回應標頭的時間、HTTP 狀態與預留額。`run-N.json` 記下 Worker 計時、影格、證據、Token 與程式品質驗證。以 Azure 計費資料核對可歸屬的費用後，用 `verified-billing.json` 記錄輪次字串對 USD micros 整數。缺少單輪可歸屬費用就保留待測，不將預留額當成帳單。

| 輪次 | 路數 | 本機 Pipeline | FFmpeg／VLM／改圖／PDF／HTML | VLM／改圖請求、429、Timeout、Retry | Token／費用／累積 | 產物／品質 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | A（1） | 待測 | 待測 | 待測 | 待測 | 待測 |
| 2 | B（2） | 待測 | 待測 | 待測 | 待測 | 待測 |
| 3 | B（2） | 待測 | 待測 | 待測 | 待測 | 待測 |
| 4 | A（1） | 待測 | 待測 | 待測 | 待測 | 待測 |
| 5 | A（1） | 待測 | 待測 | 待測 | 待測 | 待測 |
| 6 | B（2） | 待測 | 待測 | 待測 | 待測 | 待測 |

| 指標 | A | B |
| --- | --- | --- |
| 排序後三輪耗時、中位數、最慢值 | 待測 | 待測 |
| Pipeline 加速與關鍵路徑 | 待測 | 待測 |
| 真實 Queue Wait、Claim-to-Ready、Blob、Complete | 待測。共用佇列未參與此次本機模型測試 | 待測。共用佇列未參與此次本機模型測試 |

本機 Pipeline 以進入影片處理至完整本機產物驗證計時。腳本另列模型處理區間與本機驗證；同時執行的子階段不相加成總秒數。從 `spans` 起迄及 analysis 計時確認關鍵路徑。請求紀錄的服務時間止於回應標頭，含完整接收與解析的時間看 `image_edit_request`。服務端內部排隊無法從回應中獨立分離。雲端 Queue Wait 用 `queued_at` 到首次領取，另記 Claim-to-Ready，包含 Blob 與回寫。離線儲存驗證不能代替該段真實量測。

## 品質通過條件、失敗與決策

- 驗收工具沿用正式影片分析、報告生成、PDF／四圖來源關聯及 SHA-256 驗證，並生成符合正式 Schema 的本機 `result.json`。HTML／sidecar 的資產須存在且 Hash 相符。所有產物本機保存，本模式不執行 Blob 上傳或 Supabase Claim/Complete。
- A/B 使用相同證據影格、Prompt Hash、改圖尺寸設定及四圖案例。逐組確認風險種類、嚴重度、證據定位、After 改動範圍與局部對照。由不看組別的審查者逐頁比對 PDF 和 HTML，確認中文字型、框選、可讀性、模擬標示與缺圖。生成隨機性造成來源或案例差異時，保留原數據並標記不可直接歸因於並行。無影像人審時品質仍待驗收。
- 429、Timeout、已送出但回應未知、產物不完整、缺少用量或未知成本各自記錄，不補零、不挑最快樣本。留存執行順序、所有失敗與隔離條件。本次真實失敗案例待測。若需要重跑，需先對帳並另行核准，不能覆寫原始批次。
- 啟用兩路須有六輪有效結果、品質未退化、證據與契約無缺漏、無新增限流與超額。比較中位數與最慢值，查看收益是否同時出現在改圖和本機總流程。若沒有穩定收益或成本／品質證據不全，維持一路。最終決策待測。6 分鐘是第一目標，4 分鐘是挑戰目標。
- 後續獨立驗收專用佇列三戶、VM 重啟、Lease 恢復、停止開關、回復與 Blob 實體資產。僅在經確認隔離的環境領件。`MEOWHO_WORKER_MAX_JOBS=1` 不指定 Job ID。共享配額、本機與 VM 差異、六輪樣本量與 Azure 計費匯總粒度均限制結論。
