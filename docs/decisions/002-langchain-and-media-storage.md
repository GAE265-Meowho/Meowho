# 002 AI 層改用 LangChain；照片與 3D 模型的儲存方案

- 日期：2026-10-28
- 發起人：Tina
- 狀態：LangChain 已採用；儲存方案已由決策 006 取代（2026-10-31）

## 一、AI 層改用 LangChain

### 背景
原本 `src/lib/llm` 自己用 fetch 呼叫 Gemini／OpenAI，換供應商要改程式，也很難加入 RAG、Agent 等後續功能（M05 週報、M07 配對、M12 知識庫）。

### 決定
- 改用 LangChain.js（`@langchain/core` 1.x），供應商套件：`@langchain/google-genai`、`@langchain/openai`（含 Azure OpenAI）、`@langchain/anthropic`。
- 換模型只改環境變數：`AI_PROVIDER`、`AI_MODEL`、`AI_MODEL_VISION`（見 `.env.example`）。
- 結構：
  - `src/lib/ai/config.ts`：選供應商與模型（純函式、有測試）
  - `src/lib/ai/models.ts`：`getChatModel(task)`，唯一能 import 供應商 SDK 的地方
  - `src/lib/ai/schemas.ts`：每個任務的輸出格式（zod），交給 `withStructuredOutput`，回來再驗證一次
  - `src/lib/ai/chain.ts`：通用鏈「訊息組裝 → 模型 → zod 驗證」，模型以參數注入，測試不必連網
  - `src/lib/ai/<功能>.ts`：各功能的鏈；`src/lib/ai/server.ts`：API route 的入口，失敗回 `null`
- 規則式退回方案保留：沒有金鑰或 AI 失敗時，功能照常可用。

### 新增 AI 功能的做法
1. 提示詞放 `src/lib/prompts/<功能>.ts`
2. 輸出格式加到 `src/lib/ai/schemas.ts`
3. 在 `src/lib/ai/<功能>.ts` 用 `createStructuredChain()` 組鏈，並用假模型寫測試
4. 在 `server.ts` 加入口；API route 只呼叫入口
5. 之後的 RAG（知識庫、配對）用 LangChain 的 retriever，向量資料表照 §7 命名為 `meow_` 開頭（Supabase pgvector）

### 影響
- 套件增加約 4 個；只在伺服器端載入，不影響前端大小。
- 舊環境變數 `LLM_PROVIDER`、`LLM_MODEL` 仍相容。

## 二、照片與 3D 模型放哪裡（建議）

| | Supabase Storage | Vercel Blob | Azure Blob Storage |
|---|---|---|---|
| 免費額度 | 1 GB 容量、5 GB 流量／月，**與另一個 App 共用**；單檔上限 50 MB | Hobby：1 GB 容量、10 GB 流量／月 | Azure for Students：每年 US$100 額度，不需信用卡（需學生身分） |
| 超過時 | 會被要求升級 | **服務暫停 30 天**，Hobby 不能加購 | 從額度扣款，用完才停 |
| 權限 | 已接好，用 RLS 控制誰能看 | 公開網址為主，要另寫權限 | 用 SAS 網址控制 |
| 適合 | 貓咪照片、相簿（已在用） | 少量 Demo 檔 | 3D 模型、居家影片、之後的 GPU 生成服務 |

### 建議
1. **照片 → 繼續用 Supabase Storage**（`meow-cat-photos`）。上傳前縮到最長邊 1024px、WebP，每張約 100–200 KB。
2. **3D 模型（GLB）與居家影片 → Azure Blob Storage**（若組內有人能申請 Azure for Students）。3D 檔動輒 5–30 MB，放在共用的 Supabase 很快吃光容量與流量；Azure 額度也能拿來跑 3D 生成的 GPU 服務。
3. 沒有 Azure 時，Demo 期間 3D 先放 Vercel Blob，只放少量示範模型，並注意超量會被停用 30 天。
4. GLB 一律先用 `gltf-transform` 壓縮（Draco／meshopt、貼圖轉 WebP），目標單檔 ≤ 5 MB。
5. 程式做「儲存介面」（例如 `src/lib/storage/`），資料表只存網址與路徑（`meow_` 表），之後換存放位置不用改業務程式。

### 參考
- Vercel Blob 用量與價格：https://vercel.com/docs/vercel-blob/usage-and-pricing
- Supabase 價格：https://supabase.com/pricing
- Azure for Students：https://azure.microsoft.com/free/students
