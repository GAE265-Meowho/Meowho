# 模組：帳號與權限（account）

> 最後更新：2026-10-28｜Tina × Claude Code
> 規則：本檔隨程式碼同一個 PR 更新；「決策」與「地雷」只增不刪（過時的標註［已失效］）。

## 目的
Google 登入、條款同意、角色判斷（訪客／會員／貓戶長／領養人／認證中途／管理員）、會員中心。

## 負責
主責：C｜支援：D

## 對應需求
- SRS：M01（FR-01-01～07）
- 測試：UT-01-*、UT-DB-*、MT-01-*
- PLAN 任務：1

## 目前狀態
Google 登入（Supabase Auth）與條款同意已完成（Issue #1）。未設定 Supabase 環境變數時為「示範模式」：可操作但不能登入。

## 資料表（Supabase）
- `meow_profiles`（id＝auth.users.id、email、display_name、avatar_url、role、terms_version、terms_agreed_at），第一次登入 MeowHome 時由前端建立（`Auth.tsx`）；email 由 trigger 從登入憑證帶入，不能自填
- migration：`supabase/migrations/0001_meow.sql`（共用 Supabase 專案 `pnnehddxeujxghhnnqrv`，物件一律 `meow_` 開頭，見 AGENTS.md §7）

## API／主要函式
- `useAuth()`（`src/components/Auth.tsx`）：user、profile、login(next)、logout、agreeTerms、needsTerms
- `requireUserForApi()`（`src/lib/supabase/server.ts`）：API 路由登入檢查
- `/auth/callback`：OAuth 回呼，導回 `next`（只接受站內路徑）
- `src/middleware.ts`：每次請求更新 session

## 主要檔案
- `src/components/Auth.tsx`、`src/lib/supabase/*`、`src/middleware.ts`、`src/app/auth/callback/route.ts`、`src/app/legal/page.tsx`
- `src/components/Providers.tsx`（`data-login`：未登入時觸發登入）
- 設定步驟：`docs/setup/SUPABASE_LLM_SETUP.md`
- `docs/spec/08_隱私權政策與服務條款.md`

## 決策
- 只提供 Google 登入。
- 不提供一鍵刪除帳號；條款註明可來信申請。

## 待確認
- 管理員白名單放環境變數還是資料表。

## 地雷
- 條款版本更新時要讓使用者重新同意（FR-01-02）：修改 `TERMS_VERSION`（`src/lib/supabase/config.ts`）即可。
- Google OAuth consent screen 在 Testing 狀態時，只有 Test users 能登入。
- profiles 的 update policy 限制 role 只能是 member，避免自行升級為 admin。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
| 2026-10-28 | Tina × Claude Code | Supabase Auth、Google 登入、條款同意 | #1 |
