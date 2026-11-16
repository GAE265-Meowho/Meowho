### 09:00｜渝茜（發起）× Claude Code
- Issue：#354 虛擬飼養改版（第 5 份：診間）
- 分支／PR：feat/354-play-vet-camera｜（主 agent 統一開）
- 模組：readiness
- 做了什麼：
  - 診間加一位獸醫：`lib/play/vet-room.ts` 的 `DOCTOR_PARTS`（24 個 mesh：圓臉、深色頭髮、圓眼鏡、白袍、袍裡橘色上衣、聽診器、名牌、腮紅，造型對齊 `SpeakerAvatar` 的 vet）、`DOCTOR_AT`（站在診療台後側面向貓）、`doctorPose`（呼吸、偶爾看貓、每 8 秒輕點頭、說話時點兩下；減少動態時不動）、`vetTalkKey`（獸醫說話的卡片才有 key）；`VetRoom` 畫出獸醫，`PlayStage`／`PlayGame` 多傳 `vetTalk`。
  - 修正 `camera-shot.test.ts` 裡第 1 天外出籠的距離斷言（「劇情鏡頭退遠」那個 commit 改了數值，舊斷言 < 1.5 會失敗），改成「比跑酷近」。
- 決策：色值加進 `VET_COLORS`（ink、orange、orange-soft），獸醫零件也集中在 vet-room.ts。
- 未完成／下一步：手機版構圖沒調；點頭只在換到「有獸醫台詞的卡片」時觸發，不是逐句（逐句要動 NodeStep）。
- 風險／地雷：截圖用 esbuild 把 VetRoom 單獨打包成暫時頁面（沙盒 dev server 記憶體不足一直被砍），不是走完整遊戲流程。

### 10:00｜渝茜（發起）× Claude Code（追加：看診動作、手機構圖）
- 做了什麼：
  - `lib/play/vet-doctor.ts`（附測試）：`solveArm`（肩、肘兩段式 IK，上臂 0.30、前臂 0.32 公尺，手肘往外下方彎）、`catSpots`（依體型算貓背、靠獸醫側的側腹、拍背點）、`doctorAct`（14 秒一輪：摸貓背 → 停 → 聽診器聽側腹＋另一手扶背 → 停 → 輕拍背 → 停；說話或減少動態時手放下）、`toDoctorLocal`／`toWorld`。
  - `vet-room.ts`：手臂、手、聽頭改成會動（從靜態零件移除）；新增 `CAT_AT`（貓略往後側放，獸醫摸得到）、`CAT_YAW`；獸醫往檯面後緣靠。
  - `VetRoom.tsx`：每幀依 `doctorAct` 擺手臂（圓柱段＋手肘球＋手）、聽頭與連線；目標平滑靠近不跳動；窄畫面時看的點移到貓和獸醫中間並壓低。
- 未完成／下一步：手的動作只在暫時頁面（esbuild 單獨打包 VetRoom）截圖看過，沒在完整遊戲流程裡看。
