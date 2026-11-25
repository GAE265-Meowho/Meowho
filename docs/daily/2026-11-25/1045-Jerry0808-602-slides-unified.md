### 10:45｜Jerry0808（發起）× ChatGPT (GPT-6)
- Issue：#602；修正 PR #637/#638 的簡報規範不一致
- 發現：之前外加 70+ 條 `.wl-content` 樣式、重複的 header/avatar/pageNo，繞過組長設計的 Huninn/Noto Sans TC、SPK、DEMO、PG、card/tech 元件。
- 修正：兩張投影片全面改用原生 `.head/.tag/.spk/.lead/.card/.k/.t/.p/.tech/.pg` 與 `<!--SPK:世安-->/<!--DEMO:5-->/<!--PG-->`，保留原內容及 Demo 順序。
- `_src/extra.css` 移除過去為這兩頁新增的獨立 CSS，不新增全域規則或肖像資產；`_src/build.py` 保持不動。
- 同步 `Meowho_成果報告_1126.html` 與獨立兩頁 HTML，兩者採完全相同的共用字型/元件/講者頭像。
- 靜態驗收：建置基線與原始 HTML 逐字相同；25 張只有第 15、16 張 section 改變，其餘 23 張 HTML 完全相同；兩頁 head/spk/demo/pg 自動產物存在，原有照片資產路徑正確。
- 本工具無法在容器重新下載整個私有 repo 的二進位資產並完成實體投影驗收，組長仍需在正式環境以 Chrome/Edge 目視確認字體載入與尺寸。
