# 模組：AI 對話建檔（ai-onboarding）

> 最後更新：2026-10-28｜Tina × Claude Code
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
中途之家／愛貓人士 onboarding 已完成（Issue #1）：首頁「我想建立貓戶」→ `/onboarding` 聊天建立貓戶 → 拍照＋問答＋自由口述建立貓咪名片。領養人 onboarding 尚未開始（任務 7）。

## 資料表（Supabase）
- 寫入 `meow_households`、`meow_cats`（前端以使用者身分直接寫入，由 RLS 保護）
- 待建立：`adopter_profiles`

## API／主要函式
- `POST /api/onboarding/household`：解析一題回答（LLM＋規則合併，位置一律再經規則過濾到區）
- `POST /api/onboarding/cat-photo`：照片 → 是否為貓、品種、毛色、年齡層
- `POST /api/onboarding/cat-story`：自由口述 → 性格、癖好、補充、結紮
- `src/lib/llm/index.ts`：`llmJson()`，以 `LLM_PROVIDER` 切換 Gemini／OpenAI，失敗重試 1 次；未設定金鑰時 `isLLMConfigured()` 為 false
- 語音：瀏覽器內建語音辨識（zh-TW）；不支援時提示改用打字（Whisper 備援待做）

## 主要檔案
- `src/lib/prompts/onboarding.ts`（三組提示詞）
- `src/components/onboarding/Chat.tsx`、`HouseholdFlow.tsx`、`CatFlow.tsx`、`src/app/onboarding/page.tsx`

## 決策
- LLM 抽取結果一律先給使用者確認才寫入。
- 必填最少化，其他欄位之後由週報提醒補。

## 待確認
- LLM 供應商：程式已支援 Gemini 與 OpenAI，預設 Gemini（`gemini-2.5-flash`），最終選擇待組內確認。
- Whisper 語音備援是否需要。

## 地雷
- 不可從症狀或口述推論疾病寫入資料；獸醫診斷只能人工填寫（提示詞已明確禁止）。
- LLM 回傳的欄位一律經過合併函式檢查，只採用當題欄位，非法值忽略。
- API 在 Supabase 已設定時要求登入，避免匿名大量呼叫 LLM。
- 照片在瀏覽器先縮到最長邊 1024px 再送 AI 與上傳。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
| 2026-10-28 | Tina × Claude Code | 中途之家 onboarding（聊天建立貓戶、拍照＋問答＋口述建立貓咪） | #1 |
