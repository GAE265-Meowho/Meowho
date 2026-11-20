# 正式網站字型

正式網站從 `public/fonts/site/` 提供 WOFF2。原有 CSS 變數仍只掛在 `body`，fallback 的順序與字型度量沿用舊版 Next.js 輸出。MeowHQ 的 `Noto Sans TC` 使用同一批資產。Quicksand 的 Latin 子集仍會預載。

| 字型 | 正常字重 | 獨立 WOFF2 | 總 bytes | 授權 |
| --- | --- | ---: | ---: | --- |
| Quicksand | 500、600、700 | 3 | 63,716 | [OFL 1.1](../../../public/fonts/site/quicksand-OFL.txt) |
| Zen Maru Gothic | 500、700 | 244 | 4,119,512 | [OFL 1.1](../../../public/fonts/site/zenmarugothic-OFL.txt) |
| Noto Sans TC | 400、500、700 | 108 | 4,275,236 | [OFL 1.1](../../../public/fonts/site/notosanstc-OFL.txt) |

取得方式為 Google Fonts CSS2 提供給 Chromium 的 WOFF2。同一變動字型檔可供多個指定字重共用。355 個檔案的位元內容與舊版成功建置完全相同。每個來源 URL、大小和 SHA-256 見 [來源清單](site-font-sources.json)。

`next/font/local` 未提供依字型來源設定 `unicode-range` 的介面。網站使用本機 CSS 保留 Google Fonts 對應的範圍和字型檔，因此瀏覽器只下載文字所需的子集。建置及瀏覽器均可直接使用儲存庫內的資產。

未來更新字型時，請以相同家族及字重重新取得 CSS 和 WOFF2，核對授權及 SHA-256，為內容變更的檔案更換檔名，並同步更新 CSS、Latin 預載路徑及來源清單。正式網站以外的獨立設計原型有自己的建置流程。
