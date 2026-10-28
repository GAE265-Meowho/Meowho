# Supabase、Google 登入與 LLM 設定（約 20 分鐘，組長做一次）

> 金鑰只能貼在 Supabase、Google Cloud、Vercel 的設定頁與自己的 `.env.local`，**不要貼進聊天、程式或 commit**。

## 1. Supabase 專案（共用既有專案 `pnnehddxeujxghhnnqrv`）
免費方案同時只能有 2 個啟用中的專案，所以 MeowHome 與其他 App **共用同一個 Supabase 專案**。規範見 `AGENTS.md` §7，重點：
- MeowHome 所有資料表、函式、trigger、policy 一律 **`meow_` 開頭**，照片 bucket 為 **`meow-cat-photos`**
- 不在 `auth.users` 加 trigger（會員資料由網站第一次登入時建立）
- **不要修改 Site URL**（那是其他 App 的設定），只「新增」Redirect URLs

到 **Project Settings → API** 記下：
- `Project URL`（`https://pnnehddxeujxghhnnqrv.supabase.co`）→ `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. 建立 MeowHome 資料表
**SQL Editor → New query**，貼上 `supabase/migrations/0001_meow.sql` 全文 → **Run**（可重複執行）。

完成後 Table Editor（public schema）會多出 `meow_profiles`、`meow_households`、`meow_cats`、`meow_notifications`、`meow_shelter_verifications`、`meow_site_settings`；Storage 會有 `meow-cat-photos`。其他 App 的資料表不會被改動。

## 3. Google 登入
0. 如果這個 Supabase 專案的 Google 登入**已經啟用**（其他 App 在用），步驟 1～3 可以跳過，直接做步驟 4；只是 Google 登入畫面顯示的 App 名稱會是原本那個。
1. https://console.cloud.google.com → 建立專案 `MeowHome` → **APIs & Services → OAuth consent screen**：External、App name `MeowHome`、填支援信箱 → 儲存
2. **Credentials → Create credentials → OAuth client ID** → Web application
   - Authorized redirect URIs：`https://<你的 Supabase 專案 ID>.supabase.co/auth/v1/callback`（Supabase 的 Google provider 頁面有這個網址可複製）
3. 複製 Client ID、Client Secret → Supabase **Authentication → Sign In / Providers → Google** → 啟用並貼上 → Save
4. Supabase **Authentication → URL Configuration**：
   - **Site URL 不要改**（共用專案，那是其他 App 的）
   - Redirect URLs **新增**：
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

## 7. 指定第一位管理員
1. 先用你的 Google 帳號登入網站一次（會自動建立 profile）
2. Supabase **SQL Editor** 執行（換成你的 Gmail）：
   ```sql
   update public.meow_profiles set role = 'admin' where email = '你的Gmail@gmail.com';
   ```
3. 開啟隱藏後台 **`/mh-console-8k2p`**（例如 `https://meowhome.hsiangsolutions.com/mh-console-8k2p`），之後可在「管理員」分頁用 Email 授權其他人。
   - 這個網址不會出現在任何介面上，也不給搜尋引擎收錄；但真正的保護是資料庫權限，非管理員打開只會看到「找不到頁面」。
   - 想換網址：把 `src/app/mh-console-8k2p` 資料夾改名即可。

## 驗證
1. 打開網站 → 首頁「我想建立貓戶」→ Google 登入 → 同意條款
2. 聊天建立貓戶 → 拍照新增貓咪 → 建立名片
3. 「我的貓戶」看得到剛建立的貓戶與貓咪；Supabase Table Editor 也看得到資料
