# Supabase、Google 登入與 LLM 設定（約 20 分鐘，組長做一次）

> 金鑰只能貼在 Supabase、Google Cloud、Vercel 的設定頁與自己的 `.env.local`，**不要貼進聊天、程式或 commit**。

## 1. 建立 Supabase 專案
1. https://supabase.com → Sign in with GitHub → **New project**
2. 名稱 `meowhome`，Region 選 **Northeast Asia (Tokyo)** 或 **Southeast Asia (Singapore)**，設定資料庫密碼（自己保存）
3. 建好後到 **Project Settings → API**，記下：
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. 建立資料表
**SQL Editor → New query**，貼上 `supabase/migrations/0001_onboarding.sql` 全文 → **Run**。
完成後 Table Editor 會出現 `profiles`、`households`、`cats`，Storage 會有 `cat-photos`。

## 3. Google 登入
1. https://console.cloud.google.com → 建立專案 `MeowHome` → **APIs & Services → OAuth consent screen**：External、App name `MeowHome`、填支援信箱 → 儲存
2. **Credentials → Create credentials → OAuth client ID** → Web application
   - Authorized redirect URIs：`https://<你的 Supabase 專案 ID>.supabase.co/auth/v1/callback`（Supabase 的 Google provider 頁面有這個網址可複製）
3. 複製 Client ID、Client Secret → Supabase **Authentication → Sign In / Providers → Google** → 啟用並貼上 → Save
4. Supabase **Authentication → URL Configuration**：
   - Site URL：`https://meowhome.hsiangsolutions.com`
   - Redirect URLs 加入：
     - `https://meowhome.hsiangsolutions.com/**`
     - `https://*-somebabytina-3426.vercel.app/**`（Vercel 預覽網址）
     - `http://localhost:3000/**`、`http://localhost:3001/**`
5. OAuth consent screen 還在 Testing 狀態時，只有加入 **Test users** 的 Google 帳號能登入：把組員與老師的 Gmail 加進去（或按 Publish app）。

## 4. LLM 金鑰（擇一）
- **Gemini（建議，有免費額度）**：https://aistudio.google.com/apikey → Create API key → `GEMINI_API_KEY`
- OpenAI：https://platform.openai.com/api-keys → `OPENAI_API_KEY`，並設 `LLM_PROVIDER=openai`

## 5. 填到 Vercel
Vercel → meow-home → **Settings → Environment Variables**，加入（Production＋Preview 都勾）：

| 名稱 | 值 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 步驟 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 步驟 1 |
| `GEMINI_API_KEY` | 步驟 4 |
| `LLM_PROVIDER` | `gemini`（或 `openai`） |

儲存後到 **Deployments → 最新一筆 → Redeploy**，環境變數才會生效。

## 6. 本機開發
複製 `.env.example` 為 `.env.local` 填入同樣的值，`npm run dev`。

## 驗證
1. 打開網站 → 首頁「我想建立貓戶」→ Google 登入 → 同意條款
2. 聊天建立貓戶 → 拍照新增貓咪 → 建立名片
3. 「我的貓戶」看得到剛建立的貓戶與貓咪；Supabase Table Editor 也看得到資料
