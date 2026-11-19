# WelfareLens 影片分析效能驗收

**狀態：2026-11-19 完成真實 A／B 各一輪。帳單、盲審與後四輪待完成，維持既有並行預設。**

## 問題與比較對象

MeowHome 正常路徑是 Supabase 領件 → Azure Blob 下載 → FFmpeg 抽影格 → VLM 分析與植物補查 → 風險彙整 → AI 改圖 → HTML／JSON／PDF → 上傳 → 完成回寫。歷史單筆雲端流程約 8 分 34 秒，當次各階段分解待測，不能直接當成這次比較的 A 組。

A 維持逐案改圖。B 允許兩個獨立案例同時進行，仍按原順序保留輸出和來源關聯。若上一個改圖請求尚未結束且已到下個安全發送時間，B 可重疊等待。若主要耗時在節流、VLM 或報告渲染，收益可能很小。兩組使用同一映像、模型、提示詞生成規則、八影格抽樣、兩路 VLM、固定價目與節流、`n=1`、`size=auto`、`quality=high` 和 PNG。沒有刪減案例來滿足配額。超額的輪次視為失敗。

## 版本與執行環境

| 項目 | 紀錄 |
| --- | --- |
| 主線基準 | `656c4e705f9ab058387163e58278ff3718c5f4bf`，PR #496 合併提交 |
| RC.1 Registry RepoDigest（Linux AMD64） | `ghcr.io/gae265-meowho/meowho/welfarelens-worker@sha256:894eda7afbe4c1405e2191e131a4b8472529c8859b7c218c8b133b1b620cdef9` |
| RC.1 Docker Desktop 本機 `.Id` | `sha256:894eda7afbe4c1405e2191e131a4b8472529c8859b7c218c8b133b1b620cdef9`（此 containerd 後端的實測值） |
| RC.1 Registry manifest 的 `config.digest` | `sha256:c3d1057768f418113b64d7419f9e525092d1b2ee34fa694937c1dff4c6579971` |
| RC.1 OCI revision 及發布 Commit | `36a0bb270582bcf3a7c7061c08f4651ae1bd2aeb` |
| 真實執行 | 2026-11-19（台北時間），Windows Docker Desktop，A 14:27:53–14:32:59，B 14:33:51–14:37:37。Worker 分析階段取樣峰值 RSS 為 A 162.0 MiB、B 146.7 MiB，未量測整台主機峰值 |
| 影片 | 授權測試用 `cleanroom.mp4`，本機 ffprobe 查得 H.264，111.325 秒，720 × 1280，29,326,000 bytes |
| 來源影片 SHA-256、取樣及案例 | 影片 Hash 固定於私有核准設定。A、B 八張影格的 Hash 與時間戳一致。實際改圖 A 6 件、B 5 件 |
| VLM | 本機設定對應 `gpt-6.1-terra`，版本 `2026-10-26`，GlobalStandard，2,000 RPM／2,000,000 TPM。Azure 控制面唯讀核對 |
| 改圖 | 本機設定對應 `gpt-image-2.5-sunburst`，版本 `2026-09-08`，GlobalStandard，6 requests／60 秒。Azure 控制面唯讀核對 |
| 配額共享與時窗 | 已確認 Pilot 保留時段。Azure Monitor 查詢近 20 分鐘未回傳資料點，無法藉此判定其他服務的請求量。兩輪沒有 429 |
| 計費 | 本機兩輪 Pilot 已核准 US$30。六輪暫保留 US$40，後四輪須另行批准。帳戶有效價目與實際逐輪帳單待核對 |

[合併後 Worker CI](https://github.com/GAE265-Meowho/Meowho/actions/runs/44436327751) · [合併後網站 CI](https://github.com/GAE265-Meowho/Meowho/actions/runs/44436327480)

2026-11-19 在 Windows Docker Desktop 依 [RC.1 發布紀錄](https://github.com/GAE265-Meowho/Meowho/actions/runs/44457072100) 拉取固定 Digest，以 `docker image inspect` 分別查核 RepoDigests、`.Id`、平台及 OCI revision，再以 `docker manifest inspect` 查核 Registry manifest 的配置雜湊。此主機的 RepoDigest 雜湊與 `.Id` 顯示同值，Registry 配置雜湊則不同。跨主機追溯使用 RepoDigest，主機啟動器使用當次 Docker 查到的 `.Id` 鎖定執行映像。

固定 RC.1 通過斷網 Self-test、合成影格 JSON／PDF 生成，以及以 `cleanroom.mp4` 執行不帶 `--run` 的斷網預檢。預檢沒有建立請求帳本，付費測量另以真實輪次紀錄為準。

## 執行與重現

1. 在單一本機或專用 VM 建立專案外、只有操作者可讀寫的批次目錄。Windows 使用限本人存取的 ACL，Linux 使用 `umask 077`。持久掛載同一批次目錄，使用本機磁碟。影片與部屬核准設定唯讀掛載。原始 trace、影片、完整報告、圖片、計費明細、環境檔及身分資訊均留在私有目錄。
2. 在私有 `approval.json` 記錄 `approvalRef`、`commit`（40 字元）、`digest`（`sha256:…`）、`inputSha256`、`pilotUsdMicros: 30000000`、`batchUsdMicros: 40000000`，以及 `vlm`、`image` 各自的 `host`、`deployment`、`version`、`sku`、`confirmedRpm`、`gapMs`、`reserveUsdMicros`。一美元等於 1,000,000 micros。逐次預留額依控制面及計費證據確認。程式會比對實際 host、deployment 與每個請求的 model。核准編號供追溯，操作者須先取得對應的實際核准。
3. 兩輪 Pilot 使用本文件的歷史工作負載、公開未快取費率及保守餘裕核算預留額。VLM 納入影像／文字輸入及最長回覆，改圖納入輸入圖、提示詞及 `auto/high` 輸出差異。失敗、逾時及未知請求一律保留全額。若部署、費率或用量證據顯示預算可能不足，停止後續請求或輪次。
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
- **請求數硬上限**由程式執行。兩輪 Pilot 核准按歷史用量、公開費率及保守餘裕設定 **預留額**。預留 Terra 每次 US$0.50，按長上下文未快取定價且輸出用滿 8,000 tokens，仍可涵蓋 220,000 個輸入 tokens。預留 Sunburst 每次 US$0.75，以歷史最高 1,347 輸入 tokens 全數按圖片費率計，可涵蓋約 24,640 個圖片輸出 tokens。這組預留額在 28 次 VLM 與 16 次改圖的硬上限下共 US$26。US$2.73 為歷史工作負載試算，Azure 實際費用以可歸屬的帳單為準，現有證據沒有涵蓋所有異常情境的計費上界。若發現用量或費率可能超出核准範圍，應停止後續輪次。擴充沿用同一帳本，以累計金額加上餘下四輪預留額核對 US$40。
- 已授權直接執行前兩輪，另外的付費校準不列為前置條件。保留兩輪的 Usage 後，由帳務讀取者比對 Azure 可歸屬的 Meter 與實際費用。是否繼續後四輪依對帳、品質和另行授權決定。

順序為 **A、B、B、A、A、B**。每輪完整重跑 VLM，不使用其他輪次的 AI 結果。使用者若只授權 Pilot，停在第二輪。

## 原始數據與統計

私有 `requests.jsonl` 記下 dispatch、起送間隔、節流等待、到回應標頭的時間、HTTP 狀態與預留額。`run-N.json` 記下 Worker 計時、影格、證據、Token 與程式品質驗證。以 Azure 計費資料核對可歸屬的費用後，用 `verified-billing.json` 記錄輪次字串對 USD micros 整數。尚未對帳的輪次保留待測。開啟第三輪時必須已有 `"1"`、`"2"` 的已確認帳單數字，已驗證的零費用可填 0。後續可補錄第三至六輪。

| 輪次 | 路數 | 本機 Pipeline | FFmpeg／VLM／改圖／PDF／HTML | VLM／改圖請求、429、Timeout、Retry | Token／費用／累積 | 產物／品質 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | A（1） | 306.099 秒 | 5.767／99.811／187.910／5.051／1.110 秒 | 8／6，429、Timeout、Retry 各 0 | 預留 US$8.50。按回傳 Usage 估計 US$0.5433，待帳單 | 程式驗證 PASS。PDF 10 頁、HTML 23 個唯一圖片資產 |
| 2 | B（2） | 225.942 秒 | 6.833／103.209／94.348／7.930／0.944 秒 | 8／5，429、Timeout、Retry 各 0 | 預留 US$7.75。按回傳 Usage 估計 US$0.4952，待帳單 | 程式驗證 PASS。PDF 9 頁、HTML 20 個唯一圖片資產 |
| 3 | B（2） | 待測 | 待測 | 待測 | 待測 | 待測 |
| 4 | A（1） | 待測 | 待測 | 待測 | 待測 | 待測 |
| 5 | A（1） | 待測 | 待測 | 待測 | 待測 | 待測 |
| 6 | B（2） | 待測 | 待測 | 待測 | 待測 | 待測 |

| 指標 | A | B |
| --- | --- | --- |
| 排序後三輪耗時、中位數、最慢值 | 目前 1/3，306.099 秒，中位數待測 | 目前 1/3，225.942 秒，中位數待測 |
| Pipeline 加速與關鍵路徑 | 改圖為最長單一階段，187.910 秒 | 整體少 80.157 秒（26.2%，1.35×），改圖少 93.562 秒（1.99×）。VLM 103.209 秒，轉為最長單一階段 |
| 真實 Queue Wait、Claim-to-Ready、Blob、Complete | 待測。共用佇列未參與此次本機模型測試 | 待測。共用佇列未參與此次本機模型測試 |

本機 Pipeline 以進入影片處理至完整本機產物驗證計時。腳本另列模型處理區間與本機驗證；同時執行的子階段不相加成總秒數。從 `spans` 起迄及 analysis 計時確認關鍵路徑。請求紀錄的服務時間止於回應標頭，含完整接收與解析的時間看 `image_edit_request`。服務端內部排隊無法從回應中獨立分離。雲端 Queue Wait 用 `queued_at` 到首次領取，另記 Claim-to-Ready，包含 Blob 與回寫。離線儲存驗證不能代替該段真實量測。

| 輪次 | VLM 輸入／輸出 tokens | 改圖輸入／輸出 tokens | 改圖節流等待合計 | 改圖至回應標頭合計 | 產物驗證 |
| --- | --- | --- | --- | --- | --- |
| A | 46,072／20,688 | 8,059／6,948 | 0 秒 | 182.505 秒 | 1.537 秒 |
| B | 46,072／20,343 | 6,717／5,790 | 13.132 秒 | 155.663 秒 | 3.826 秒 |

27 筆實際請求皆有回應，合計 16 次 VLM、11 次改圖。最短改圖起送間隔 A 為 29.064 秒、B 為 12.000 秒。B 的改圖測量區間重疊約 82.6 秒，代表兩路確實發生重疊。B 同時少一件改圖，兩輪只共享四個不同的改圖輸入 Hash，生成提示的 Hash 全部不同，因此不能將 80.157 秒的差額全部歸因於並行。

累計預留 US$16.25。估算以 Terra 輸入全採長上下文 cached-write 公告價 US$2.50、輸出 US$7.50，Sunburst 輸入全採影像價 US$8、輸出 US$30，每百萬 tokens 計算，兩輪約 **US$1.04**。帳戶實際計費、分類及折扣待對帳，故未建立 `verified-billing.json`。

## 品質通過條件、失敗與決策

- 驗收工具沿用正式影片分析、報告生成、PDF／四圖來源關聯及 SHA-256 驗證，並生成符合正式 Schema 的本機 `result.json`。HTML／sidecar 的資產須存在且 Hash 相符。所有產物本機保存，本模式不執行 Blob 上傳或 Supabase Claim/Complete。
- A/B 使用相同證據影格、Prompt Hash、改圖尺寸設定及四圖案例。逐組確認風險種類、嚴重度、證據定位、After 改動範圍與局部對照。由不看組別的審查者逐頁比對 PDF 和 HTML，確認中文字型、框選、可讀性、模擬標示與缺圖。生成隨機性造成來源或案例差異時，保留原數據並標記不可直接歸因於並行。無影像人審時品質仍待驗收。
- 兩輪均完成 `meow_env_result/1`、HTML、sidecar、四圖及 PDF 的結構與雜湊驗證。共用風險項目與等級一致（細繩與電線為高、窗戶為中），電線引用的證據影格不同。兩輪首頁均列 5 個改善項目及 6 個待確認項目。改善案例引用的原始影格數為 A 4 張、B 5 張。
- 已渲染 A 10 頁及 B 9 頁，檢查整份頁面縮圖及代表性頁面。首頁中文、統計與改圖模擬標示可讀，無明顯空白頁或截斷。共同床邊線材案例可辨識模擬前後差異。仍需盲審各案例的證據、改善一致性與場景保留，程式通過無法替代此項。
- 本次 429、Timeout、Retry 與無回應請求均為 0。後續保留執行順序及所有失敗。沒有執行第 3 至 6 輪，原始批次在 Git 外保留。建議完成帳單及盲審後依另一次批准續測，觀察各組中位數及最慢值，並先維持既有預設。
- #509 合併後的 Linux Worker CI 在 1 ms 測試間隔暴露計時器提前喚醒的錯誤。斷網 Linux AMD64 回歸測試重現 `benchmark_clock`。修正後會等待牆上時鐘與單調時鐘都滿足間隔才登錄並送出請求，真正的時鐘倒退仍會停止。
- 啟用兩路須有六輪有效結果、品質未退化、證據與契約無缺漏、無新增限流與超額。比較中位數與最慢值，查看收益是否同時出現在改圖和本機總流程。若沒有穩定收益或成本／品質證據不全，維持一路。最終決策待測。6 分鐘是第一目標，4 分鐘是挑戰目標。
- 後續獨立驗收專用佇列三戶、VM 重啟、Lease 恢復、停止開關、回復與 Blob 實體資產。僅在經確認隔離的環境領件。`MEOWHO_WORKER_MAX_JOBS=1` 不指定 Job ID。共享配額、本機與 VM 差異、六輪樣本量與 Azure 計費匯總粒度均限制結論。
