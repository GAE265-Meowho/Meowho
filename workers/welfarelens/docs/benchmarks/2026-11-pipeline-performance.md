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

2026-11-19 在 Windows Docker Desktop 建置 Linux AMD64 離線驗證映像，以 `--network none` 掛載實際影片及私有可寫目錄，確認六項 Azure AI 設定可讀取、FFmpeg 抽影格、Chromium 產 PDF、容器 Self-test，且沒有建立請求帳本。此映像未發布至 Registry；GHCR Digest 與最終發布版 OCI revision 仍待驗證。

## 執行與重現

1. 在單一本機或專用 VM 建立專案外、只有操作者可讀寫的批次目錄。Windows 使用限本人存取的 ACL，Linux 使用 `umask 077`。持久掛載同一批次目錄，使用本機磁碟。影片與部屬核准設定唯讀掛載。原始 trace、影片、完整報告、圖片、計費明細、環境檔及身分資訊均留在私有目錄。
2. 在私有 `approval.json` 記錄 `approvalRef`、`commit`（40 字元）、`digest`（`sha256:…`）、`inputSha256`、`pilotUsdMicros`、`batchUsdMicros`，以及 `vlm`、`image` 各自的 `host`、`deployment`、`version`、`sku`、`confirmedRpm`、`gapMs`、`reserveUsdMicros`。一美元等於 1,000,000 micros。版本、配額與預留額由操作者依控制面及計價文件確認。程式會比對本機載入的實際 host 和 deployment，並檢查每次送出的 model。核准編號是工程追溯資料，並無外部審批驗證。
3. 費用由「可證明的單次最壞計價」核算成預留額。VLM 須考慮影像／文字輸入、最長回覆及有效費率，改圖須考慮輸入圖、提示詞與 `auto/high` 所能產生的最壞輸出。以未快取價計算，失敗、逾時及未知請求一律保留全額。尚無法證明單次預留額足以涵蓋實際帳單時，維持阻擋。公開價目可用作交叉檢查，實際帳戶費率仍須核對。
4. 每輪硬上限 VLM 14 次與改圖 8 次。Pilot 最多 28／16，六輪合計最多 84／48。預檢以最大包絡核對兩輪和六輪預算。每一個 dispatch 落地並同步寫碟後才呼叫 Azure。批次目錄有獨占鎖，重跑相同輪次會拒絕，Crash 之後保留鎖供對帳。勿清空或複製目錄來繼續測試。A、B 共享同一套限流演算法與兩輪間的間隔狀態。改圖至少間隔 12 秒，每分鐘最多五次本批次起送，並可拉長間隔。遇 429 停止新請求，已送出者可能計費。VLM 本次停用傳輸重試，Pipeline 未通過會停止後續輪次。
5. 主機啟動器要求本機 Docker socket 和固定的 GHCR Digest，核對 RepoDigests、Linux AMD64、OCI revision 與核准 Commit。容器以已查驗的 Image ID 執行，禁止自動 Pull，逐輪保存實際 Image ID、Digest、Commit 及 OCI revision。這是本機版本追溯，發布時仍應以可信任 CI 的 Digest 為準。

Windows PowerShell 範例。`$Image` 使用發布 CI 提供的完整 `ghcr.io/gae265-meowho/meowho/welfarelens-worker@sha256:…`，`$Config`、`$Video` 和 `$Batch` 使用已存在的私有絕對路徑。`$AzureEnv` 指向現有私有 Azure AI 設定，程式只傳入兩組端點、Deployment 與 Key 共六項設定。Docker 管理權限可檢視執行中容器的環境，應使用個人或專用主機。Linux 可用相同 Node 啟動器和對應 shell 變數。

```powershell
$Digest = (Get-Content -Raw $Config | ConvertFrom-Json).digest
$Image = "ghcr.io/gae265-meowho/meowho/welfarelens-worker@$Digest"
docker pull --platform linux/amd64 $Image
docker run --rm --network none $Image --self-test
node workers/welfarelens/scripts/run-pipeline-benchmark.mjs --config $Config --input $Video --batch $Batch --azure-env $AzureEnv
# 上一行為斷網預檢，會抽一張實際影格並確認 Chromium 能寫出 PDF。
# 確認預算與限額並取得 Pilot 明確核准後，才加上 --run 1；成功後改為 --run 2。
# Pilot 審查及第二次核准後，依序 --run 3 至 6，附上相同的 --expansion-approval <核准編號>。
node workers/welfarelens/scripts/summarize-pipeline-benchmark.mjs $Batch
```

## 單次費用上界核對

- Terra Global Standard 公告未快取長語境費率為每百萬輸入 US$2、輸出 US$7.50。模型最高輸入 922,000 tokens，程式明確設定 `max_completion_tokens=8000`。以模型級包絡試算為 **US$1.904／次**，28 次即 **US$53.312**，尚未含改圖，已超過 Pilot US$10 提案。這個試算遠寬於實際影格請求。要在原預算內執行，須取得可驗證且適用於本 Worker 實際文字、Schema、影格／裁切與模型的輸入 token 上界，以及確認帳戶價目。 [Terra 定價公告](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/gpt-6-1-terra-now-generally-available-in-microsoft-foundry-build-agents-that-see/4567769) · [Microsoft 模型規格](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure)
- Sunburst 保留 `size=auto`、`quality=high`、單張 PNG。Microsoft 公告每百萬未快取 tokens 的文字輸入、圖片輸入、圖片輸出費率分別為 US$5、US$8、US$30。若三項可計費 token 上界分別為 T、I、O，單次公開價上界為 `(5T + 8I + 30O) / 1,000,000` 美元。官方規格列出 4,000 字元提示詞上限，模型文件指出 `auto` 的輸出用量由生成圖決定。目前缺此版本計費 token 上界，實際帳戶費率也待核對，因此仍無可核准的單次費用。 [Microsoft Sunburst 定價公告](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/create-multimodal-applications-with-openai-models-in-microsoft-foundry/4543593) · [OpenAI 圖片計費說明](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency)
- 設 Terra 單次保守上界為 V、Sunburst 為 I，須同時滿足 `28V + 16I ≤ US$10` 與 `84V + 48I ≤ US$40`。預留額供程式在送出請求前判斷；實際費用依 Azure 計費紀錄另行核對。

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
