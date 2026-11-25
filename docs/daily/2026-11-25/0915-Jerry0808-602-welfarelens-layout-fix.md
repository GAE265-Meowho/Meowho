### 09:15｜Jerry0808（發起）× ChatGPT (GPT-6)
- Issue：#602；修補已合併 PR #637 的兩頁簡報版面
- 分支：fix/602-welfarelens-slide-layout-avatar
- 模組：docs/slides/final-1126
- 根因：團隊 base_1118.html 的全域 h2 使用 absolute 定位，前一版卡片標題只設定字級；另自訂頁首誤用了「世」字佔位符。
- 修復：對 wl-final 內卡片標題重設 position/inset；右上改引用已存在的 assets/avatars/世安_2026.svg（與使用者上傳照片相符）。
- 驗收：原始成品與 build.py 等價結果一致；重建後只有第 15、16 張 section 改變，其他 23 張逐字相同；Chromium 1920×1080 模擬原 CSS 衝突並測試，兩頁 h2 為 static、肖像載入。
- 不變：正式網站、講稿、共用 build.py、其他組員內容、既有肖像資產。
- 待辦：組長在正式投影環境目視確認；本次未執行全站 npm 四項檢查。
