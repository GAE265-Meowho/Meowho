# 模組：AI 對話建檔（ai-onboarding）

> 最後更新：2026-10-29｜Tina × Claude Code
> 規則：本檔隨程式碼同一個 PR 更新；「決策」與「地雷」只增不刪（過時的標註［已失效］）。

## 目的
新貓：先拍照（Vision 建議品種毛色年齡）→ 對話問答 → 自由口述整理；領養人 onboarding 問答。

## 負責
主責：D｜支援：E

## 對應需求
- SRS：M03（FR-03-*）
- 測試：UT-03-*、MT-02-01～03、MT-03-01
- PLAN 任務：6、7

## 目前狀態
中途之家／愛貓人士 onboarding 已完成（Issue #1）：首頁「我想建立貓戶」→ `/onboarding` 聊天建立貓戶 → 拍照＋問答＋自由口述建立貓咪名片。2026-11-05（#206）新增貓咪改成設計稿 `docs/design/new-cat-flow.html` 的五步表單（`src/components/new-cat/`）：拍照 → 說說牠（口述經 `/api/onboarding/turn` 填進表格並標「你說過」，`lib/onboarding/new-cat-form.ts` 的 `storyExtras` 用規則補個性量表等 LLM 沒有的欄位）→ 快問快答 → 名片 → 完成，取代建貓對話 `IntakeChat`。Issue #33 進行真實流程走查與修正；領養人 onboarding 尚未開始（任務 7）。

## 資料表（Supabase）
- 寫入 `meow_households`、`meow_cats`（前端以使用者身分直接寫入，由 RLS 保護）
- 待建立：`adopter_profiles`

## API／主要函式
- `POST /api/onboarding/household`：解析一題回答（LLM＋規則合併，位置一律再經規則過濾到區）
- `POST /api/onboarding/cat-photo`：照片 → 是否為貓、品種、毛色、年齡層
- `POST /api/onboarding/cat-story`：自由口述 → 性格、癖好、補充、結紮
- `src/lib/ai/server.ts`：`extractHousehold()`、`recognizeCatPhoto()`、`organizeCatStory()`，未設定或失敗回傳 `null`（呼叫端改用規則式）
- `src/lib/ai/models.ts`：`getChatModel("text"|"vision")`，以 `AI_PROVIDER` 切換 Gemini／OpenAI／Azure OpenAI／Anthropic（LangChain）
- `src/lib/ai/schemas.ts`：三個任務的 zod 輸出格式；`chain.ts`：訊息組裝（自動附防護規則）→ `withStructuredOutput` → zod 驗證
- `src/lib/ai/guard.ts`：`AI_LIMITS`（建檔 200 字、問答 300 字、每段 20 輪、每天 50 次）、`checkInput()`、`wrapUserInput()`、`withGuard()`；防護規則文字在 `src/lib/prompts/guard.ts`
- 語音：瀏覽器內建語音辨識（zh-TW）；不支援時提示改用打字（Whisper 備援待做）

## 主要檔案
- `src/lib/prompts/onboarding.ts`（三組提示詞）
- `src/components/onboarding/Chat.tsx`、`HouseholdFlow.tsx`、`CatFlow.tsx`、`src/app/onboarding/page.tsx`

## 決策
- 2026-11-04｜新增貓咪的照片改成依序收側面、正面、背面（必填，給 3D 用），之後可再加生活照；建立後自動跑 AI 三視角並在前台預覽（Tina，#188）。
- 2026-11-04｜開頭改成一句「來幫「XX」新增一隻待領養的貓吧。先上傳貓貓的照片。」，拿掉長段拍攝說明；改用側面／正面／背面三個上傳按鈕，按哪個就放哪個角度（`MediaAnalysis.angle`），齊了才出現「加照片」（Tina，#195）。
- 2026-11-04｜新增貓咪：生活照至少 3 張（`MIN_PHOTOS`；第 1 張後可先描述，其餘填好時再要求補滿）；年紀改為選填存月齡（`est_age_months`，名片有「大約年紀」欄，對話問「大約幾個月或幾歲」，年齡層只是照片猜的時也會問），年齡層由月齡算出；取代 #109「不記月齡」。月齡帶進 3D 模型 `profile.age_months`（Tina，#185）。
- 新貓入戶一律先登入，並由使用者明確選擇貓咪歸屬的貓戶（即使只有一個貓戶也要選），避免放錯戶。
- LLM 抽取結果一律先給使用者確認才寫入。
- 必填最少化，其他欄位之後由週報提醒補。
- LLM 輸入防護：只處理和貓有關的事；使用者內容一律包成 `<user_input>` 資料；建檔每題 200 字，超過前端不能送出、後端回 400（決策 004，Issue #38）。
- 2026-10-31（子哲，#72）：改為**建檔對話引擎**（`src/lib/onboarding/conversation.ts`）：自由對話，一句話擷取所有欄位、只追問缺少的必填（喵戶：身分→名稱→縣市區；貓咪：照片→名字→年齡層）；照片／影片判讀只填空欄並標「請確認」；不猜性別；AI 失敗退回規則式。LLM 任務在 `src/lib/ai/intake.ts`（喵戶／貓咪一句話擷取、照片判讀），提示詞在 `src/lib/prompts/onboarding.ts` 的 `INTAKE_*`，回應不用 emoji。

## 待確認
- LLM 供應商：改用 LangChain，可切換 Gemini／OpenAI／Azure OpenAI／Anthropic，預設 Gemini（`gemini-2.5-flash`），最終選擇待組內確認。見 `docs/decisions/002-langchain-and-media-storage.md`。
- Whisper 語音備援是否需要。

## 地雷
- 不可從症狀或口述推論疾病寫入資料；獸醫診斷只能人工填寫（提示詞已明確禁止）。
- LLM 回傳的欄位一律經過合併函式檢查，只採用當題欄位，非法值忽略。
- API 在 Supabase 已設定時要求登入，避免匿名大量呼叫 LLM。
- 照片在瀏覽器先縮到最長邊 1024px 再送 AI 與上傳。
- 新增 LLM 任務時，使用者內容一定要經 `wrapUserInput()`，API 一定要用 `checkInput()`；不要直接把使用者文字接進提示詞。
- `intake.module.css` 的清單樣式不要寫 `.homeItem span` 這類後代選擇器，會選到 CatButton 的文字；用 `.homeItem > div > span`（#84）。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
| 2026-10-28 | Tina × Claude Code | 中途之家 onboarding（聊天建立貓戶、拍照＋問答＋口述建立貓咪） | #1 |
| 2026-10-28 | Tina × Claude Code | 建立貓戶前先顯示說明（WelcomeHousehold）；`?cat=1` 新貓入戶 | #5 |
| 2026-10-28 | Tina × Claude Code | 新貓入戶改為：先 Google 登入 → 一律選擇「既有貓戶」或「住進新家」；進入點決策抽成 `src/lib/onboarding/route.ts`（`decideStart`） | #7 |
| 2026-10-29 | Tina × Codex | Issue #33：Vision 信心低於 0.5 不預填品種／毛色；結構化 AI 失敗重試一次；補 UT-03-04 | #33 |

| 2026-10-29 | Tina × Claude Code | LLM 輸入防護：服務範圍、prompt injection、字數上限（決策 004） | #38 |
| 2026-10-29 | Tina × Claude Code | 登入狀態載入失敗不再永遠停在「載入中…」（Auth.tsx catch＋8 秒逾時） | #33 |
| 2026-10-29 | Tina × Claude Code | 語音輸入依原因顯示錯誤訊息；位置／介紹提問帶入貓戶名稱；聯絡信箱填入 | #33 |
| 2026-10-31 | 子哲 × Claude Code | 建檔對話引擎與 LLM 擷取鏈（尚未接畫面；舊的一問一答流程仍在） | 待建立 |
| 2026-11-01 | 子哲 × Claude Code | 修正喵戶清單貓形按鈕文字被染灰（深色按鈕白字） | #84 |
