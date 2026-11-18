# WelfareLens Worker

MeowHome 的環境報告 Worker。從本目錄安裝 Node.js 依賴及執行測試。網站仍在 repository 根目錄獨立安裝、建置及發布。

```sh
npm ci
npm run typecheck
npm run worker:test-fixture
npm test
docker build --platform linux/amd64 -f Dockerfile.worker -t welfarelens-worker:local .
docker run --rm --network none welfarelens-worker:local --self-test
```

測試影片由 FFmpeg 在本機合成。私有回放測試可透過 `WELFARELENS_PRIVATE_REPLAY_VIDEO`、`WELFARELENS_PRIVATE_REPLAY_DIR` 或 `VIDEO_READING_JOB` 指向獲准的本機資料。配置詳見 [環境設定與發布](ENVIRONMENT.md) 及 [VM 操作](VM_RUNBOOK.md)。

`result.json`、共用 items 及既有 RPC 沿用原契約。預設關閉私有 JSON 視圖的寫入和讀取，舊報告繼續使用既有 HTML 回退。保留 Worker RC `b658381a85130b8bb7514ae93b61fd29ac69ee43` 的執行程式及測試。歷史操作紀錄與私有驗收產物留在原工作區。
