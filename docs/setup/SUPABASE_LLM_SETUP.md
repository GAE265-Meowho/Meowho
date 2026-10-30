# Supabase、Google 登入與 LLM 設定（約 20 分鐘，組長做一次）

> 金鑰只能貼在 Supabase、Google Cloud、Vercel 的設定頁與自己的 `.env.local`，**不要貼進聊天、程式或 commit**。
> 正式環境已於 2026-10-30 設定完成（子哲）。這份文件是重建或接手時照著做的步驟。

## 1. Supabase 專案（Meowho喵戶 獨立專案 `onebpkbkrnnwamwsoelo`）
Meowho喵戶 使用**自己的 Supabase 專案**，不與其他 App 共用（決策 `docs/decisions/005-dedicated-supabase.md`）。資料庫物件仍一律 `meow_` 開頭，規範見 `AGENTS.md` §7。

新建專案時的選項：
- Region：**Northeast Asia (Tokyo)**
- **Enable Data API**：開
- **Automatically expose new tables**：開（migration 依賴這個設定讓 `meow_` 表可以從前端讀寫；權限仍由 RLS 控管）
- **Enable automatic RLS**：關（每張 `meow_` 表的 RLS 已寫在 migration 裡）

到 **Project Settings → API Keys** 記下：
- `Project URL`（`https://onebpkbkrnnwamwsoelo.supabase.co`）→ `NEXT_PUBLIC_SUPABASE_URL`
- Publishable key（`anon`）→ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **`service_role`／secret key 不要用、不要放進前端或 Vercel**

## 2. 建立 Meowho喵戶 資料表
**SQL Editor → New query**，依序貼上並執行（每個都可重複執行）：
1. `supabase/migrations/0001_meow.sql`
2. `supabase/migrations/0002_meow_hq.sql`
3. `supabase/migrations/0003_meow_site_assets.sql`

> 2026-10-30 已在 `onebpkbkrnnwamwsoelo` 執行完成（0001～0003）。之後的 migration 依 `AGENTS.md` §7.4 執行。

完成後 Table Editor（public schema）會有 `meow_profiles`、`meow_households`、`meow_cats`、`meow_notifications`、`meow_shelter_verifications`、`meow_site_settings` 與 MeowHQ 相關的 `meow_` 表；Storage 會有 `meow-cat-photos`。

## 3. Google 登入
1. https://console.cloud.google.com → 專案 **`meowho`** → **Google Auth Platform**
   - **品牌**：App 名稱 `Meowho喵戶`、支援信箱
   - **目標對象**：External
2. **用戶端 → 建立用戶端** → 網頁應用程式，名稱 `meowho`
   - 已授權的重新導向 URI：`https://onebpkbkrnnwamwsoelo.supabase.co/auth/v1/callback`
   - 已授權的 JavaScript 來源：不用填
3. 複製**用戶端 ID**與**用戶端密碼**（不是 Google 帳號密碼）→ Supabase **Authentication → Sign In / Providers → Google** → 啟用、貼上 → Save
4. Supabase **Authentication → URL Configuration**：
   - **Site URL**：`https://meowho.vercel.app`（沒設定時登入完會被導回 `localhost:3000`）
   - **Redirect URLs**（一次加一個）：
     - `https://meowho.vercel.app/**`
     - `https://*-zing15s-projects.vercel.app/**`（Vercel PR 預覽網址）
     - `http://localhost:3000/**`
5. 應用程式還在「測試中」時，只有 **目標對象 → 測試使用者** 名單上的 Gmail 能登入：把組員與老師的 Gmail 加進去（或按「發布應用程式」）。

## 4. LLM 金鑰
- **Gemini（目前使用）**：https://aistudio.google.com/apikey → Create API key → `GEMINI_API_KEY`
- 其他供應商：設 `AI_PROVIDER=openai`／`azure`／`anthropic` 並填對應金鑰，變數名稱見 `.env.example`

## 5. 填到 Vercel
Vercel 專案 **`zing15s-projects/meowho`**（https://meowho.vercel.app，連動 `GAE265-Meowho/Meowho` 的 `main`）→ **Settings → Environment Variables**，Production＋Preview 都勾：

| 名稱 | 值 | 類型 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 步驟 1 | Config（`NEXT_PUBLIC_` 開頭不能選 Secret） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 步驟 1 | Config（本來就公開給前端，權限靠 RLS） |
| `AI_PROVIDER` | `gemini` | Secret |
| `GEMINI_API_KEY` | 步驟 4 | Secret |
| `NEXT_PUBLIC_LOCAL_PHOTOS` | `0` | Config |

儲存後到 **Deployments → 最新一筆 → Redeploy**，環境變數才會生效。
- **Framework Preset 必須是 Next.js**（Settings → Build and Deployment）。設成 Other 時建置會成功，但每一頁都是 404。

## 6. 本機開發
複製 `.env.example` 為 `.env.local` 填入同樣的值，`npm run dev`。

## 7. 指定第一位系統管理員
1. 先用你的 Google 帳號登入網站一次（會自動建立 `meow_profiles`）
2. Supabase **SQL Editor** 執行（換成你的 Gmail）：
   ```sql
   update public.meow_profiles set role = 'system_admin' where email = '你的Gmail@gmail.com';
   ```
   結果應為 `1 row affected`；`0 rows` 表示還沒登入過。
3. 開啟後台 **`/MeowHQ`**（https://meowho.vercel.app/MeowHQ），之後在後台授權其他管理員。

## 驗證
1. 打開 https://meowho.vercel.app → 「登入／建立喵戶」→ Google 登入 → 同意條款
2. 建立喵戶 → 拍照新增貓咪 → 建立名片
3. 「我的喵戶」看得到剛建立的喵戶與貓咪；Supabase Table Editor 也看得到資料
