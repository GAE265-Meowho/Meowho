# 模組：後台與內容審核（admin-moderation）

> 最後更新：2026-10-28｜Tina × Claude Code
> 規則：本檔隨程式碼同一個 PR 更新；「決策」與「地雷」只增不刪（過時的標註［已失效］）。

## 目的
管理員後台（知識庫、產品價格、中途認證、檢舉、Demo 模式、站台標誌）與 AI 內容審核。

## 負責
主責：C、E｜支援：B

## 對應需求
- SRS：M15（FR-15-*）、M16（FR-16-*）
- 測試：UT-15-*、UT-16-*、MT-15-*、MT-16-*、E2E-06、E2E-07
- PLAN 任務：17

## 目前狀態
隱藏後台 `/mh-console-8k2p` 已完成（Issue #3）：中途認證審核、管理員授權／移除、網站標誌（存 `site_settings`）。頁尾的管理者設定入口已移除。檢舉與內容審核尚未開始。

## 資料表（Supabase）
- 已建立（`0001_meow.sql`）：`meow_shelter_verifications`（同一貓戶同時只能一筆審核中）、`meow_notifications`、`meow_site_settings`（key/value，公開讀、管理員寫）
- `meow_profiles.role`（member/admin）、`meow_profiles.email`
- 待建立：`reports`

## API／主要函式
- 資料庫函式：`meow_is_admin()`、`meow_set_admin(email, bool)`、`meow_review_verification(id, approve, note)`（核准時給徽章並通知申請人）
- trigger：送出認證申請 → 通知所有管理員；角色與 `verified_shelter` 只能由管理員變更
- 前端：`src/app/mh-console-8k2p/page.tsx`、`src/components/VerificationApply.tsx`（貓戶長申請）、`src/lib/verification.ts`
- 待建立：檢舉處理、影像與文字審核

## 主要檔案
- `src/components/Providers.tsx`（從 `site_settings` 讀取標誌、`setLogo` 寫入）、`src/lib/mock-data.ts`（`LOGOS`）

## 決策
- 不更換 logo 檔案，只能由管理者在 3 款中選擇。
- 後台用隱藏網址、不放任何連結；安全性靠 RLS 與 security definer 函式，不靠網址。
- 第一位管理員用 SQL 指定，之後在後台以 Email 授權（對方需先登入過一次）。
- 認證機制目前由管理員人工審核。

## 待確認
—

## 地雷
- 隱藏網址若外流，非管理員仍讀不到任何資料，但要避免在文件、聊天群組外公開。
- 管理員不能移除自己的權限（避免沒有管理員）。

## 變更紀錄
| 日期 | 發起人 × 工具 | 變更 | PR |
|---|---|---|---|
| 2026-10-28 | Tina × Claude Code | 建立模組文件 | — |
| 2026-10-28 | Tina × Claude Code | 隱藏後台、中途認證審核、管理員授權、站台標誌存資料庫、站內通知 | #3 |
