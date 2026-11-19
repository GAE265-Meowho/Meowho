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
| 計費 | Pilot 預算政策 US$30，首次付費執行仍待批准。六輪暫保留 US$40，後四輪須另行批准。帳戶有效價目、可證明上界與實際逐輪帳單待核對 |

[合併後 Worker CI](https://github.com/GAE265-Meowho/Meowho/actions/runs/44436327751) · [合併後網站 CI](https://github.com/GAE265-Meowho/Meowho/actions/runs/44436327480)

2026-11-19 在 Windows Docker Desktop 建置 Linux AMD64 離線驗證映像，以 `--network none` 掛載實際影片及私有可寫目錄，確認六項 Azure AI 設定可讀取、FFmpeg 抽影格、Chromium 產 PDF、容器 Self-test，且沒有建立請求帳本。此映像未發布至 Registry；GHCR Digest 與最終發布版 OCI revision 仍待驗證。

## 執行與重現

1. 在單一本機或專用 VM 建立專案外、只有操作者可讀寫的批次目錄。Windows 使用限本人存取的 ACL，Linux 使用 `umask 077`。持久掛載同一批次目錄，使用本機磁碟。影片與部屬核准設定唯讀掛載。原始 trace、影片、完整報告、圖片、計費明細、環境檔及身分資訊均留在私有目錄。
2. 在私有 `approval.json` 記錄 `approvalRef`、`commit`（40 字元）、`digest`（`sha256:…`）、`inputSha256`、`pilotUsdMicros: 30000000`、`batchUsdMicros: 40000000`，以及 `vlm`、`image` 各自的 `host`、`deployment`、`version`、`sku`、`confirmedRpm`、`gapMs`、`reserveUsdMicros`。一美元等於 1,000,000 micros。逐次預留額依控制面及計費證據確認。程式會比對實際 host、deployment 與每個請求的 model。核准編號供追溯，操作者須先取得對應的實際核准。
3. 費用由「可證明的單次最壞計價」核算成預留額。VLM 須考慮影像／文字輸入、最長回覆及有效費率，改圖須考慮輸入圖、提示詞與 `auto/high` 所能產生的最壞輸出。以未快取價計算，失敗、逾時及未知請求一律保留全額。尚無法證明單次預留額足以涵蓋實際帳單時，維持阻擋。公開價目可用作交叉檢查，實際帳戶費率仍須核對。
4. 每輪硬上限 VLM 14 次與改圖 8 次。Pilot 最多 28／16，六輪合計最多 84／48。Pilot 僅檢查兩輪預算。後四輪須在 Pilot 成功、兩輪均完成帳單歸屬及另行核准後才可開始。每輪以當時的累積支出加上該階段剩餘輪次的最高預留額核對。已對帳的 Pilot 每輪採帳單與原預留的較高值計入六輪總預算，避免釋放保留額或重複加收同一筆費用。第三輪鎖定兩輪對帳數字及核准編號，後續輪次沿用。每一個 dispatch 落地並同步寫碟後才呼叫 Azure。批次目錄有獨占鎖，重跑同輪會拒絕，Crash 後保留鎖供對帳。勿清空或複製目錄來繼續測試。兩組共享限流與輪次間隔狀態，改圖至少間隔 12 秒，本批次每分鐘最多五次起送。遇 429 停止新請求。VLM 停用傳輸重試，Pipeline 未通過會停止後續輪次。
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

## 成本證據與付費前判定

| 來源 | 實際觀察與工作負載試算 |
| --- | --- |
| Terra 歷史完整影片，8 次影格 | 每次 5,759 輸入 tokens，輸出 1,170–4,019。總計 46,072 輸入、22,788 輸出。以公告短／長語境未快取價換算，當批約 US$0.160–0.263 |
| 現行 Terra 請求，離線擷取 | 對既有八張真實 JPEG，以現行 `createAnalyzeHandler` 的注入傳輸捕捉請求，只統計大小。系統提示 10,731 bytes、Schema 7,503 bytes、JPEG 24,305–103,981 bytes、整包 JSON 51,526–157,762 bytes。每次送單張 `detail=high`，`max_completion_tokens=8000`。影格長邊限制 1440，植物補查長邊限制 1536。Byte 數沒有直接換算為計費 tokens |
| Sunburst 歷史真實改圖，5 次 | 相同 `auto/high`，提示 483–493 字元，輸入 1,333–1,347 tokens、輸出各 1,158 tokens。歷史 usage 無文字／影像輸入細項。把全部輸入以較高的影像輸入價計算，樣本每次最多約 US$0.04552。這五次屬歷史紀錄，未涵蓋所有輸入或自動輸出尺寸 |
| 兩輪工作負載試算 | 28 次 Terra 均採歷史 5,759 輸入、8,000 最大輸出與公告長語境費率，約 US$2.003。16 次 Sunburst 採歷史最高輸入和輸出用量，約 US$0.728。合計約 **US$2.73**。未量到現行植物補查用量、素材變異與帳戶實付費率 |

- Terra 公告 Global Standard 每百萬輸入／輸出，短語境 US$1／5，長語境 US$2／7.50。922K 模型級輸入配上 Worker 的 8K 輸出，得出 US$1.904／次的模型級壓力假設。歷史八張的實際輸入量比此假設低兩個數量級。現有資料仍未證明每次影格或植物補查請求的計費上界。 [Terra 定價公告](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/gpt-6-1-terra-now-generally-available-in-microsoft-foundry-build-agents-that-see/4567769) · [Microsoft 模型規格](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure)
- Sunburst 公告 Global Standard 每百萬未快取 tokens 的文字輸入、圖片輸入、圖片輸出費率為 US$5、US$8、US$30。若可證明三類上界 T、I、O，可按 `(5T + 8I + 30O) / 1,000,000` 換算。Azure 通用 REST 文件的 usage 說明僅保證 GPT Image 1，而同專案曾收到 Sunburst usage，現行 client 也以可選欄位解析。每次回傳或細項可用性須實測。自動尺寸的新輸出沒有已查證的計費 token 上界。 [Microsoft Sunburst 定價公告](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/create-multimodal-applications-with-openai-models-in-microsoft-foundry/4543593) · [Azure Image Edit 參考](https://learn.microsoft.com/en-us/azure/foundry/reference/rest/images-create-image-edit-multipart-images-create-image-edit-json) · [OpenAI 圖片計費說明](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency)
- **請求數硬上限**由程式執行。**預留額**須以有據的單次計費上界設定，Pilot 要求 `28V + 16I ≤ US$30`。擴充時才按同一帳本，以累計金額加上餘下四輪的預留額核對 US$40。**實際費用**以 Azure 可歸屬帳單為準。歷史樣本或 US$2.73 試算不作為單次預留額，現有證據無法保證 Azure 帳單不超過 US$30。
- 最小校準先由帳務讀取者核對現有 Deployment 的價目表與上述歷史時窗的 Meter 資料。若仍缺現行 usage，另行申請校準授權，於可歸屬時窗最多送 **1 次 Terra、1 次 Sunburst**，沿用相同提示、影像、品質和模型，各送一次且不重試。保存 Usage、計量分類及帳單對帳，再審核 Pilot 的預留標準及可接受的計費風險。校準不計入六輪統計，也不以兩次樣本推導絕對上界。

順序為 **A、B、B、A、A、B**。每輪完整重跑 VLM，不使用其他輪次的 AI 結果。使用者若只授權 Pilot，停在第二輪。

## 原始數據與統計

私有 `requests.jsonl` 記下 dispatch、起送間隔、節流等待、到回應標頭的時間、HTTP 狀態與預留額。`run-N.json` 記下 Worker 計時、影格、證據、Token 與程式品質驗證。以 Azure 計費資料核對可歸屬的費用後，用 `verified-billing.json` 記錄輪次字串對 USD micros 整數。尚未對帳的輪次保留待測。開啟第三輪時必須已有 `"1"`、`"2"` 的已確認帳單數字，已驗證的零費用可填 0。後續可補錄第三至六輪。

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
