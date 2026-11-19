# Engineering Learning Review｜WelfareLens 改圖並行

## 先讀哪些程式

1. [選案](../../src/server/video/visual-cases.ts) 與 [正式改圖](../../src/server/video/before-after.ts)。正式流程從風險物件、證據與主題樣板取出改圖目標。歷史 A 組的 `after.png` 至 `after-6.png` 對應當時的索引順序。
2. [凍結歷史請求](../../scripts/freeze-controlled-image-benchmark.ts) 與 [正式模型客戶端](../../src/server/image-edit-client.ts)。先確認原圖與完整字串雜湊，再查客戶端實際表單欄位。目前一筆請求使用 `model, image, prompt, n, size, quality, output_format`，沒有 mask。
3. [共用工作池](../../src/server/video/image-edit-pool.ts) 的 `runImageEditPool`。讀 `cursor++` 和 `Promise.allSettled`，理解工作如何分配與結束。
4. [節流與帳本](../../src/server/video/benchmark-guard.ts) 的 `openControlledImageRun`、`makeRequest`。追蹤「辨認表單 → 等待上次起送加間隔 → 先寫入並同步磁碟 → 送網路」。
5. [執行與計時](../../scripts/controlled-image-benchmark.ts) 的 `executeControlledImages` 與 [離線測試](../../tests/controlled-image-benchmark.test.mjs)。觀察同一個 index 如何串接案例、要求、輸出和測量。

## Promise、工作池與節流

JavaScript 在 await 之前同步取得索引，之後等待模型 I/O。並行 2 時，兩個 async 工作迴圈先各拿索引 0、1。誰先完成就拿下一項。例如第二個先完成，可能取得索引 2。後續四件由同樣方式分配。這是 I/O 並行，即使 JavaScript 仍在同一個執行緒排程。每個工作保留自己的索引，寫入對應的 `records[index]` 和 `index+1.png`，完成順序可以不同。訊號停止後不再分新工作，`Promise.allSettled` 等已在處理的工作結束才回傳。

同一 Deployment 的所有工位共用起送間隔。12 秒代表前後兩個請求的**起送時間**至少相差 12 秒。假如第一個請求從第 0 秒跑到第 30 秒，第二個可從第 12 秒起送，兩者就能重疊。若服務通常在第 8 秒完成，第二次仍須等到第 12 秒，即使有空工位也無法提前。這也是為何提高並行數的效益取決於處理延遲和服務配額。

## 量測與可重現性

- **Wall Time** 是一整批工作從排入到全部完成的實際經過時間。
- **Service Time** 要先選邊界。本工具分別量測起送至回應標頭，以及傳輸到完整接收、解析。這些時間含網路，客戶端無法直接觀察 Azure 內部計算或排隊各自花了多久。
- **Queue Wait** 分等本機工作池工位與等 guard 節流。兩個工位的等待時間可能重疊，累計只能當診斷量。
- **Critical Path** 是決定整批結束時刻的等待鏈。可能是最後一個慢回應、上游節流形成的排隊，或產物的驗證。把所有 case duration 相加會重複加上重疊區間。
- 算重疊時，把起送、收到標頭視為區間端點。依時間排序，將「同時存在兩筆以上」的小區段加總。例如 [0,30] 與 [12,40] 的重疊為 18 秒。
- 固定六個案例，鎖定完整 Prompt、圖片 bytes、設定、原始順序與 manifest SHA-256，直接呼叫同一個 image client。省略重跑 VLM 後，上游不再改變工作量。受控測試能證明 payload 一致，雲端仍可產生不同像素與延遲。
- 一對 A／B 仍受到先後順序、其他應用的用量、當下網路與雲端資源變異影響。要決定長期預設，應重複配對並變換順序，保留異常輪次，同時檢查逐案品質、費用和限流錯誤。

## 五題 AI Engineer 面試題

| 問題 | 參考答案 |
|---|---|
| 1. 為什麼使用 worker pool？ | 每個工位以索引取工作，最多兩個模型請求進行中。相較一次對六件執行 `Promise.all`，池能限制外部資源使用，並且在停止時讓在途工作先收尾。 |
| 2. 如何證實 A/B 只改並行？ | 固定原圖位元組、完整提示、案例順序、模型、品質和節流。每次送出前再比對 multipart 的欄位及原圖雜湊，另鎖定本機 Image ID、OCI Revision 與 manifest SHA。 |
| 3. 為什麼加快 26.2% 還不能證明並行貢獻？ | 原 Pilot 為六件／五件，不同提示、定位與個別延遲同時變動。只能說觀察到一次本機完整 Pipeline 差異與 HTTP 重疊。需要固定六件的改圖試驗來量化主要變因。 |
| 4. Timeout 後為什麼仍扣預留？ | 本機無法判斷供應商是否已接收或計費。起送前先同步落地，遇未知回應停止，保留證據供後續對帳。若立即重試可能重複消耗。 |
| 5. 如何由重疊推導到 M4 淨改善？ | 用配對總 Wall Time 比較節省時間及加速比，對照到標頭區間、節流與驗證時間解釋差異。重疊是行為證據；效果量仍來自同一組輸入的多次配對與品質驗收。 |
