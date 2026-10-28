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
尚未開始。目前登入按鈕為 `data-login` 佔位。

## 資料表（Supabase）
- `users`（google_sub、email、display_name、avatar、role、terms_version、terms_agreed_at）
- 管理員白名單：環境變數或 `admins` 表（待決定）

## API／主要函式
- 待建立：Supabase Auth（Google provider）、`requireRole()` 伺服器端檢查、登入後導回原頁

## 主要檔案
- `src/components/Providers.tsx`（目前的 data-login 攔截）
- `docs/spec/08_隱私權政策與服務條款.md`

## 決策
- 只提供 Google 登入。
- 不提供一鍵刪除帳號；條款註明可來信申請。

## 待確認
- 管理員白名單放環境變數還是資料表。

## 地雷
- 條款版本更新時要讓使用者重新同意（FR-01-02）。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
