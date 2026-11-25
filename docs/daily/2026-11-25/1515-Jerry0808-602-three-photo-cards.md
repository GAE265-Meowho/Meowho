### 15:15｜Jerry0808（發起）× ChatGPT (GPT-6)
- Issue：#602；第 15 張產品前導依老師「圖＞表格＞字」建議改為三張圖片卡
- 範圍：只改 `data-label="12 安全檢測"`，第 16 張技術頁及其餘 23 張內容不動
- 新圖：電線 `assets/demo/risk_wire.jpg`、窗戶 `risk_window.jpg` 沿用團隊資料夾；植物 `risk_lily_reference.svg` 內嵌 AI 製作的真百合情境參考照，標示「情境示意」，**非 WelfareLens 實際分析證據**。
- 不將窗戶照片解讀為已確認缺乏防護；其文字僅提醒開窗前確認防墜措施。真百合對貓危害可參照 FDA/ASPCA。
- 維持組長原生 `head / SPK / DEMO / PG / card / tech` 和既有字型；不新增全域 CSS。
- 驗證：舊產生檔與 build.py 等價結果逐字一致；重建後 25 張中僅第 15 張 section 不同；三張圖片皆使用相對路徑與本地資產；仍需用正式 Chrome/Edge 做投影目視驗收。
