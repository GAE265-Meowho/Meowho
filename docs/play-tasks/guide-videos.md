# 小遊戲示範影片（#354，渝茜 2026-11-14）

每個小遊戲開始前的「怎麼玩」示範（`src/components/play/MiniGuide.tsx`、`src/lib/play/mini-guide.ts`）放的是**真正遊戲畫面**的錄影：`public/play/guide/<小遊戲>.mp4`（480px 寬、約 10～17 秒、靜音循環，七段合計約 570KB）。白色箭頭是滑鼠，按下時箭頭尖端有橘色波紋（`rec.mjs` 畫的，headless 錄不到系統游標）。說明在影片下面一排三步，每步 4～12 字。

| 小遊戲 | 檔案 | 錄了什麼 |
|---|---|---|
| 餵飯 | `feed.mp4` | 選乾飼料 → 按住倒到建議份量附近 → 放好了 |
| 換水 | `water.mp4` | 菜瓜布畫圈刷乾淨 → 按住開水沖泡泡 → 接新水到七分滿（1.6 倍速） |
| 鏟屎 | `scoop.mp4` | 鏟起砂團 → 左右甩 → 拿到垃圾袋放開，做三輪（2.4 倍速） |
| 摸摸 | `pet.mp4` | 慢慢摸下巴（1.5 倍速，取前段） |
| 刷牙 | `brush.mp4` | 第一階段「碰嘴角」：按住嘴角標記（第一次會先播衛教示範） |
| 剪指甲 | `nail.mp4` | 按住肉球推出指甲 → 指甲刀拖到白色尖端放開，剪兩根（目前的錄影還是舊版玩法，待重錄） |
| 逗貓 | `play.mp4` | 渝茜的掃描房間實機：移動滑鼠帶玩具，灰寶在地板上追（2026-11-16 用內建瀏覽器的畫布錄影 `canvas.captureStream` 錄的，只有 3D 畫面、沒有游標） |
| 外出籠 | `carrier.mp4` | 從遠處一顆一顆往籠子放零食，最後牠自己走進去（1.4 倍速） |

**逗貓**：錄影頁沒有掃描房間，所以是在渝茜的真實房間（內建瀏覽器）用 `canvas.captureStream` 錄 3D 畫面，再裁成 480 寬。要重錄就照同樣方式，錄好覆蓋 `public/play/guide/play.mp4`。

## 小遊戲畫面改了要重錄
1. `npm run dev`（錄影頁 `/dev/play-guide-rec?g=<小遊戲>` 只在開發模式有；加 `&guide=1` 可以看示範彈窗）。
2. 另開一個暫存資料夾裝 `puppeteer-core`（repo 不裝）：`mkdir /tmp/pp && cd /tmp/pp && npm i puppeteer-core@23`，把 `scripts/play-guide-rec/*` 複製過去。
3. 錄：`node rec.mjs feed`（其他同理），輸出到 `$OUT`（預設 `/tmp/play-guide-rec`）。需要 Google Chrome（`CHROME` 環境變數可改路徑）與 ffmpeg。亂數固定，砂團位置每次一樣。
4. 回 repo 根目錄：`OUT=/tmp/play-guide-rec bash scripts/play-guide-rec/encode.sh`，會裁掉背景與小遊戲自己的標題列、加速、轉成 mp4 放進 `public/play/guide/`。
5. 操作路線在 `play-<小遊戲>.mjs`（滑鼠座標以 900×760 視窗為準）；遊戲版面改了座標要跟著調。錄完用 `ffmpeg -i x.mp4 -vf fps=1,tile=4x2 sheet.png` 看一下有沒有照正確玩法做完。
