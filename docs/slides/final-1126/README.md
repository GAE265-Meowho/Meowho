# Meowho喵戶 成果報告簡報（final）

- 成品：`Meowho_成果報告_1126.html`（瀏覽器打開，方向鍵翻頁，1920×1080）
- 內容：`_src/body.html`；樣式：`_src/extra.css`；版型與翻頁程式：`_src/base_1118.html`
- 建置：`python3 -I docs/slides/final-1126/_src/build.py`，**不要直接改成品 HTML**
- 預覽：在本資料夾執行 `python3 -m http.server 4126`，開 http://localhost:4126/Meowho_成果報告_1126.html
- 每頁講者用 `<!--SPK:名字-->` 標記，頭像在 `assets/avatars/名字.jpg`；Demo 頁左上的身分與進度列用 `<!--DEMO:n-->` 產生
- 第 4 頁前導影片 `assets/video/trailer_part34.mp4`（52 MB）不進 git，向子哲索取後放進 `assets/video/`；3D 貓、3D 房間循環影片（`cat3d.mp4`、`room3d.mp4`）有進 git
- 目前 23 頁（頁碼從 Agenda 算起）；3D 貓是第 9 頁（Tina），3D 房間是第 12、13 頁（珮瑜），居家安全檢測是第 14、15 頁（世安），領養任務是第 16～20 頁（渝茜），第 16 頁是三大核心理念
- Demo 段另插 6 張 OBS 錄影畫面（`assets/obs/`，`<section class="slide obs">`），整頁圖片、不加講者、不算頁碼：中途建貓後接 01 子哲、02 Tina；換成領養人與地圖之間接 03 清俊；地圖後接 04 珮瑜；3D 房間設計後接 04 珮瑜；安全檢測兩頁之間接 05 世安
- 規則：不用 emoji、不放附註小字；用語照 `GLOSSARY.md`
