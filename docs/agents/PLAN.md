# PLAN — 計畫與任務管理

> GitHub Issues 是任務的正式來源；本檔是給 agent 快速掌握全局的鏡像與排程。
> 狀態只用：`待辦`、`進行中`、`審查中`、`完成`、`卡住`。開工改「進行中」並填負責人，收工更新。
> 最後更新：2026-10-29 00:10｜Tina × Cursor

## 里程碑

| 日期 | 檢查點 | 範圍 |
|---|---|---|
| 10/30 | 題目確認 | 範圍、架構、分工 |
| 11/05 | 高風險確認 | AR 實機、影像生成一致性、影片管線、皇家官網爬取 |
| 11/12 | P1 可運行 | 任務 1–11 |
| 11/18 | 執行追蹤 | Code Review、P1 Demo |
| 11/22 | P2 完成 | 任務 12–17 |
| 11/24 | 部署＋彩排 | E2E、Demo 影片 |
| 11/26 | 成果報告 | — |

## 任務（tracer-bullet，每張可獨立 Demo）

| # | 任務 | 模組文件 | 前置 | 期別 | Issue | 負責 | 狀態 |
|---|---|---|---|---|---|---|---|
| 0 | 首頁原型（Next.js、設計系統、管理者標誌設定） | matching | — | P0 | — | Tina | 完成 |
| 1 | Supabase、Google 登入、條款同意 | account | — | P1 | #1 | Tina | 審查中 |
| 2 | 建立貓戶、新增貓咪、我的貓戶（貓咪公開頁待做） | household-cats | 1 | P1 | #1 | Tina | 審查中 |
| 3 | 首頁帶我回家與統計改讀真實資料 | matching | 2 | P1 | 待建立 | B | 待辦 |
| 4 | 寫日記：照片上傳、公開／私密、時間軸 | household-cats | 2 | P1 | 待建立 | B | 待辦 |
| 5 | 動態牆：按讚、留言、追蹤、分享預覽 | social | 4 | P1 | 待建立 | B、C | 待辦 |
| 6 | AI 建檔：拍照＋對話問答、自由口述（中途之家 onboarding） | ai-onboarding | 2 | P1 | #1 | Tina | 審查中 |
| 7 | 領養人 onboarding（文字＋語音） | ai-onboarding | 1 | P1 | 待建立 | D | 待辦 |
| 8 | 一句話 RAG 配對（取代關鍵字原型） | matching | 3、7 | P1 | 待建立 | E | 待辦 |
| 9 | 私訊＋站內通知鈴鐺（通知基本版已完成於 #3） | social | 1 | P1 | 待建立 | C | 待辦 |
| 10 | 領養設定、提出申請、審核流程（含多人申請） | adoption | 2、7、9 | P1 | 待建立 | C | 待辦 |
| 11 | 移轉、14 天試養、時間軸分段 | adoption | 10 | P1 | 待建立 | C | 待辦 |
| 12 | 照片影片轉文字、每週週報 | ai-media-weekly | 4 | P2 | 待建立 | E | 待辦 |
| 13 | 居家環境影片 AI 風險報告 | readiness | 7 | P2 | 待建立 | F | 待辦 |
| 14 | 7 天虛擬試養（劇本、評分、摘要、加速模式） | readiness | 2、12 | P2 | 待建立 | D、F | 待辦 |
| 15 | 知識庫、皇家飼料資料庫、首年花費（含後台維護） | knowledge-commerce | 1 | P2 | 待建立 | D、A | 待辦 |
| 16 | 導購追蹤連結＋成效儀表板 | knowledge-commerce | 15 | P2 | 待建立 | A、B | 待辦 |
| 17 | 後台：標誌設定存資料庫、中途認證、管理員授權（檢舉、內容審核待做） | admin-moderation | 1 | P2 | #3 | Tina | 審查中 |
| 18 | AR 3D 貓 | readiness | 13 | P3 | 待建立 | F | 待辦 |
| 19 | 雙向評分（不公開）與申訴 | adoption | 11 | P3 | 待建立 | C | 待辦 |
| 20 | 退養流程 | adoption | 11 | P3 | 待建立 | C | 卡住（需求待確認） |
| 21 | AI 層改用 LangChain，可切換模型 | ai-onboarding | 1 | P1 | #11 | Tina | 完成 |
| 22 | SRS v1.1（後台按模組授權，決策 003）、名詞表、任務清單狀態更新、改名 Meow Home | admin-moderation | — | P0 | — | Tina | 審查中 |
| 24 | 首次登入條款：看完才能勾選同意 | account | 1 | P1 | #16 | Tina | 審查中 |
| 23 | 後台改為按模組授權：系統管理員、模組授權、稽核日誌、停權／黑名單、虛擬體驗元件管理（T-15-06～09）。拆為 MeowHQ 階段（見 `docs/hq/03`） | admin-moderation | 17、22 | P2 | 見下列 | C、B | 進行中 |
| 23-0 | MeowHQ 階段 0：共用約定型別（T-HQ-01）＋0002 資料表草案 | admin-moderation | — | P2 | #18 | Tina × Cursor | 審查中 |

| 23-1 | MeowHQ 階段 1：db（T-HQ-02、12）、logic（T-HQ-03、04）、shell（T-HQ-05、06） | admin-moderation | 23-0 | P2 | #19 db、#20 logic、#21 shell | C、B、Claude | 進行中（#20 已合併；#19、#21 由 Claude 接手審查合併） |
| 23-2 | MeowHQ 階段 2：待辦總覽與列表、Admin 授權、用戶權限管理（T-HQ-07～10） | admin-moderation | 23-1 | P2 | #22 lists-home、#23 admin-auth、#24 users | C、B | 待辦 |
| 23-3 | MeowHQ 階段 3：虛擬體驗元件管理（T-HQ-11）、獨立審查（T-HQ-13） | admin-moderation | 23-2 | P2 | 待建立 | C、B | 卡住（T-HQ-11 等 #15 儲存位置） |

## 高風險 PoC（11/05 前）

| PoC | 負責 | 狀態 |
|---|---|---|
| WebXR／A-Frame Android、iPhone 實機 | F | 待辦 |
| 以原貓照片生成虛擬貓（比較 3 方案） | F | 待辦 |
| 60 秒影片 → 抽影格＋Vision＋Whisper，量測耗時成本 | E | 待辦 |
| 皇家台灣官網 robots.txt 與試爬 5 頁 | A | 待辦 |
| RAG 20 隻貓 × 10 句，前 3 名命中率 ≥ 70% | E | 待辦 |

## 待確認（需要人決定）

- 退養流程細節
- LLM 供應商（程式已可切換 Gemini／OpenAI／Azure／Anthropic，只差決定）、影像生成方案
- 3D 模型與影片的儲存位置：建議 Azure Blob（需有人申請 Azure for Students），見 `docs/decisions/002-langchain-and-media-storage.md`
- 皇家專題要求（必做功能、KPI、品牌規範、資料提供、購買連結導向）
- Vercel 部署方式（repo 維持 private 或改 public）
- 組員姓名與 A–F 對應
- 是否改用 Tailwind，或正式採用 `globals.css` 設計 token（影響 T-P0-01）
- 使用中的虛擬體驗元件是否只能下架不能刪除；停權期間貓戶與待領養貓是否隱藏；用品類商品欄位（SRS §10 #8–11）
- 品牌名稱寫法：文件為「Meow Home」，網站顯示「MeowHome」

## 建議（agent 發現、尚未有人認領）

- 首頁還缺：貓咪詳細頁（點卡片進入）、中途之家專區（找中途、認證中途）、領養人 onboarding 入口（目前「我想領養」只導到搜尋列）、知識區完整頁、登入後的個人化首頁（我的貓戶摘要、通知）
- 貓咪公開頁 `/cats/[id]` 與分享預覽（任務 2 剩餘部分）
- Supabase 安全檢查：`meow_is_admin`、`meow_set_admin`、`meow_review_verification`、`meow_notify_admins_verification` 為 SECURITY DEFINER 且 anon 可呼叫（函式內有管理員檢查，風險低）；✅ Tina 同意：在 `0002_meow_hq.sql` 以 `revoke execute ... from anon` 收緊（併入 #19）
- PWA：補 `src/app/manifest.ts` 與 192／512 App 圖示（T-P0-01 剩餘部分）
- 系統圖表 PNG 仍顯示舊名 CAT Home，需重新輸出（`.mmd` 已改）
- MeowHQ（T-HQ-01 實作時發現，待 Tina 決定）：
  - ✅ 已決定（Tina 同意）：`unban` 納入處置類型（共 8 種）；`grant_module`、`grant_badge`、`set_role` 只作稽核日誌 action。
  - 規格書 §4.7 沒列「解除停權、重新上架、加入／移出黑名單」的快選原因，目前為空清單。
  - 現有 `role = 'admin'` 的使用者，✅ 已決定（Tina 同意）：現有 `admin` 一律遷移成 `system_admin`。
- MeowHQ db（#19 實作時發現）：
  - 執行 `0002_meow_hq.sql` 會讓前端的 `isAdmin`（`src/components/Auth.tsx`，`role === "admin"`）與舊隱藏後台 `/mh-console-8k2p` 失效（現有 admin 升為 `system_admin`）。前端在 #21 調整前，建議先不要在正式環境執行 0002，或由 Tina 決定接受舊後台暫時不可用。
  - 0001 的 `meow_guard_profile` 有錯：管理員更新別人的會員資料時會把對方 Email 蓋成自己的（0002 已修正）。
  - 開發計畫 T-HQ-02 要求「收緊 `meow_is_admin` 的 anon 執行權」；這會讓依賴它的 RLS policy 對匿名訪客出錯，0002 已把相關 policy 改為 `to authenticated` 才收回。之後新增 policy 若會被匿名查詢，**不要**呼叫權限函式。
  - SQL 測試可用 `node supabase/tests/run-pglite.mjs` 在本機臨時資料庫執行（`npm i --no-save @electric-sql/pglite`）。要不要納入 `npm test` 與 CI（需把 `@electric-sql/pglite` 加進 devDependencies，屬 Issue #19 範圍外），請 Tina 決定。
- MeowHQ 系統管理員離職流程（Tina 2026-10-29 提出，待認領）：離職＝由另一位系統管理員執行 `meow_set_role` 撤銷身分（降成一般會員或管理員），原因必填並寫稽核日誌；至少要保留一位，移除前須先指定接手者。**黑名單只用於貓友與貓戶長，不適用於管理員與系統管理員**（Tina 2026-10-29 確認），所以離職流程不包含加入黑名單。建議在 Admin 授權畫面（#23）提供「撤銷身分」操作：降級＋清空模組授權＋一筆稽核日誌。
- MeowHQ 黑名單對象（Tina 2026-10-29 確認，規格書 R9 已更新，#29、#30）：#26 的 `meow_ban_email` 已拒絕管理員（`target_is_admin`）、系統管理員（`target_is_system_admin`），以及尚未登入過的帳號（`not_found`）。#28（#20）的 `canBan` 已同步拒絕管理員；「尚未登入過的帳號」屬前端輸入檢查，由 #23／#24 處理。

  - （#20 logic）UT-HQ-05 的「貓友／貓戶長」在 `canSuspend` 都是 `role: member`，函式不區分；#20 的 `canSuspend` 對沒有「用戶權限管理」授權者回傳「沒有停權的權限」，規格書與測試計畫未規定此文字，Tina 可調整。
- 語音輸入的 Whisper 備援（Safari／Firefox 不支援瀏覽器語音辨識）
