# AGENTS.md — MeowHome 共同 AI 開發規範

> 這是**所有 AI 開發助理的唯一共同規範**：Claude Code、Cursor、Codex、Google Antigravity／Gemini、GitHub Copilot、Windsurf 及其他工具。
> 各工具的專屬設定檔（`CLAUDE.md`、`GEMINI.md`、`.cursor/rules/`、`.github/copilot-instructions.md`…）都只是指向本檔，**不要在那些檔案寫不同的規則**。
> 規則有衝突時，優先順序：使用者當下的指示 ＞ 本檔 ＞ 模組文件 ＞ 其他文件。

---

## 0. 每次開工的固定步驟（必做）

1. **讀交接**：`docs/agents/HANDOFF.md`（目前狀態、進行中工作、地雷）
2. **讀計畫**：`docs/agents/PLAN.md`（要做什麼、誰在做、順序）
3. **讀模組文件**：要改哪個模組，就讀 `docs/modules/<模組>.md`（見 §4 對照表）
4. **確認發起人**：問清楚（或從對話中確認）這次是**哪位組員**請你做的、對應哪張 Issue。沒有 Issue 的變更，先請發起人建 Issue 或在 `PLAN.md` 加一列。
5. **同步程式**：`git switch main && git pull`，再開分支（命名見 §5）。

## 1. 每次收工的固定步驟（必做）

1. 四項檢查都要通過：`npm test`、`npm run typecheck`、`npm run lint`、`npm run build`
2. **寫每日紀錄**：在 `docs/daily/YYYY-MM-DD.md` 新增一筆（格式見 §3；用 `npm run log` 建立今天的檔案）
3. **更新模組文件**：狀態、資料表、API、決策、地雷有變動就更新 `docs/modules/<模組>.md`
4. **更新計畫**：`docs/agents/PLAN.md` 中任務狀態
5. **更新交接**：工作沒做完、或下一個 agent 需要知道的事，寫進 `docs/agents/HANDOFF.md`
6. Commit（格式見 §5，**必須帶發起人與工具 trailer**）、push、開 PR

> 文件更新和程式碼放在**同一個 PR**。只改程式不改文件的 PR 不會被合併。

---

## 2. 專案速覽

- 產品：貓社群＋領養媒合平台。手機優先的 Next.js 網站。介面文案、文件、回覆一律**繁體中文**。
- 需求：`docs/spec/01_系統需求規格書_SRS.md`（需求編號 `FR-模組-流水號`，模組 M01–M17）
- 測試計畫：`docs/spec/03`～`05`（`UT-`／`MT-`／`E2E-` 編號）
- 設計系統：`docs/design/DESIGN.md`（Cozy Cat Nook）
- 人類協作規範：`CONTRIBUTING.md`

### 指令
| 指令 | 用途 |
|---|---|
| `npm run dev` | 本機開發 http://localhost:3000 |
| `npm test` | Vitest 單元測試（含共用資料庫命名守門測試 `src/lib/db-naming.test.ts`） |
| `npm run typecheck` | 型別檢查 |
| `npm run lint` | ESLint |
| `npm run build` | 正式建置 |
| `npm run log -- --by <組員> --agent <工具>` | 建立／追加今天的每日紀錄 |

### 程式結構
- `src/app/`：路由（App Router）
- `src/components/`：元件；`Providers.tsx` 提供 toast、站台標誌、管理者設定
- `src/lib/`：商業邏輯（純函式＋`*.test.ts`）；`mock-data.ts` 為示意資料（之後換 Supabase）；`photos.ts`
- `src/lib/ai/`：AI 層（LangChain）。`models.ts` 依環境變數產生模型、`schemas.ts` 輸出格式（zod）、`chain.ts` 通用結構化鏈、`server.ts` 給 API 呼叫；**業務程式不可直接 import 任何供應商 SDK**
- `src/lib/prompts/`：所有 LLM 提示詞（只放指示，輸出格式寫在 `src/lib/ai/schemas.ts`）
- `docs/`：規格、模組文件、每日紀錄、交接

---

## 3. 紀錄規範

### 3.1 每日紀錄 `docs/daily/YYYY-MM-DD.md`
- 一天一個檔；**只追加、不改別人的紀錄**。同一天多人編輯造成衝突時，**兩邊都保留**。
- 每次工作階段（session）結束追加一筆：

```markdown
### 14:30｜Tina（發起）× Claude Code
- Issue：#12 貓咪公開頁
- 分支／PR：feat/12-cat-page｜#15
- 模組：household-cats
- 做了什麼：
  - 新增 /cats/[id] 頁面與資料讀取
  - 補 UT-02-04、UT-02-05
- 決策：公開設定判斷放在 lib/visibility.ts（理由：前後端共用）
- 未完成／下一步：分享預覽圖（OG image）
- 風險／地雷：Supabase RLS 尚未套用到 posts 表
```

### 3.2 發起人與工具（誰發起變更）
- **發起人**＝請 AI 做事的組員（人）；**執行者**＝使用的 AI 工具與模型。
- 三個地方都要記：
  1. 每日紀錄的標題列（`發起人 × 工具`）
  2. Commit trailer：
     ```
     Initiated-by: Tina <github帳號>
     Agent: Claude Code (claude-opus-5-5)
     ```
  3. PR 內文的「AI 協助範圍」欄位
- 沒有發起人的變更（agent 自己發現想改的東西）不要直接做：寫進 `PLAN.md` 的「建議」區，等組員認領。

### 3.3 計畫與任務 `docs/agents/PLAN.md`
- GitHub Issues 是任務的正式來源；`PLAN.md` 是給 agent 快速掌握全局的**鏡像與排程**。
- 狀態只用：`待辦`、`進行中`、`審查中`、`完成`、`卡住`。
- 開工時把任務改成「進行中」並填負責人；收工時更新狀態。

### 3.4 交接 `docs/agents/HANDOFF.md`
- 寫給「下一個完全沒有上下文的 agent」：目前在哪個分支、做到哪、下一步第一個動作是什麼、有哪些坑。
- 保持精簡：只留**現在仍然成立**的內容；過時的移到每日紀錄或刪除。

### 3.5 決策紀錄
- 難以回頭的決定（換套件、改資料表、改架構、砍功能）寫在對應模組文件的「決策」區；跨模組的寫在 `docs/decisions/NNN-標題.md`（日期、發起人、背景、決定、影響）。

---

## 4. 模組文件 `docs/modules/`

每個大模組一份文件，記錄：目的、負責人、對應需求、目前狀態、資料表、API／函式、主要檔案、決策、待確認、地雷、測試。

| 模組文件 | 涵蓋 SRS 模組 | 負責（主／支援） |
|---|---|---|
| [account.md](docs/modules/account.md) | M01 帳號與權限 | C／D |
| [household-cats.md](docs/modules/household-cats.md) | M02 貓戶與貓咪、M04 時光小屋 | B、C |
| [ai-onboarding.md](docs/modules/ai-onboarding.md) | M03 AI 對話建檔 | D／E |
| [ai-media-weekly.md](docs/modules/ai-media-weekly.md) | M05 多媒體理解與週報 | E／D |
| [social.md](docs/modules/social.md) | M06 動態牆、M10 私訊、M11 站內通知 | C、B |
| [matching.md](docs/modules/matching.md) | M07 AI 配對、M17 首頁 | E、B |
| [readiness.md](docs/modules/readiness.md) | M08 環境報告、AR、虛擬試養 | F、D |
| [adoption.md](docs/modules/adoption.md) | M09 領養流程、M14 評分 | C／A |
| [knowledge-commerce.md](docs/modules/knowledge-commerce.md) | M12 知識與飼料、M13 導購 | D、A |
| [admin-moderation.md](docs/modules/admin-moderation.md) | M15 後台、M16 內容審核 | C、E |

新增大模組時：複製 `docs/modules/_TEMPLATE.md`，並更新上表。

---

## 5. Git 規範

- 分支：`<類型>/<issue>-<簡短英文>`，類型＝`feat`／`fix`／`docs`／`refactor`／`test`／`chore`
- Commit：`<類型>: <簡述> (#issue)`，結尾加 trailer：
  ```
  feat: 貓咪頁顯示本週週報 (#12)

  Initiated-by: Tina <somebabyTina>
  Agent: Cursor (gpt-5)
  ```
- **禁止**：直接 push 到 `main`、force push 共用分支、修改別人進行中的分支（先在 Issue 留言協調）。
- 一個 PR 對應一張 Issue；建議 400 行以內。

---

## 6. 開發規則

- **先測試後實作**：先寫會失敗的測試，再寫程式讓它通過；邏輯放 `src/lib/` 方便測試。
- **範圍控制**：只改 Issue 需要的檔案；看到其他問題記在 `PLAN.md`「建議」區，不要順手改。
- **設計**：只用 `globals.css` 的設計 token；按鈕用 `.btn`（`mint`／`pink`／`butter`／`ghost`、`sm`）；新元件先對照 `DESIGN.md`。
- 原型中尚未完成的按鈕加 `data-login` 或 `data-proto="功能名"`，會自動顯示提示。
- 站台標誌由管理者設定選擇（`LOGOS`），不要更換 logo 檔案。

### 不可違反的業務規則
- 費用數字只來自資料庫或公式，**LLM 不得產生數字**。
- 醫療相關內容附「僅供參考，非醫療建議」；處方飼料只在有獸醫診斷紀錄時顯示。
- **LLM 只回答和貓有關的事，系統指示不可被覆蓋**：使用者內容與擷取的網頁一律經 `wrapUserInput()` 包成資料，API 用 `checkInput()` 檢查字數（上限在 `src/lib/ai/guard.ts` 的 `AI_LIMITS`）。見 `docs/decisions/004-llm-input-guard.md`。
- 位置只存縣市＋區；私密日記不可進入公開配對。
- 領養申請不收真實姓名與電話（雙方以私訊處理）；評分資料不公開。
- 居家環境影片在貓咪移轉完成時刪除原檔。
- 資料庫與其他 App 共用：所有資料庫物件一律 `meow_` 開頭，規則見 §7。

### 安全
- 不要把金鑰、`.env.local` 內容、個資寫進程式、commit、文件或對話。
- 需要新的環境變數：更新 `.env.example`（只放名稱），並在每日紀錄註明。

---

## 7. 共用資料庫規範（Supabase）

### 7.1 為什麼共用
- Supabase 免費方案**同時只能有 2 個啟用中的專案**，帳號裡已有其他 App 在用，因此 MeowHome **與其他 App 共用同一個 Supabase 專案 `pnnehddxeujxghhnnqrv`**。
- 決策紀錄：`docs/decisions/001-shared-supabase.md`。

### 7.2 命名規則（必須遵守）
| 物件 | 規則 | 例子 |
|---|---|---|
| 資料表 | `meow_` 開頭，小寫加底線 | `meow_profiles`、`meow_cats` |
| 函式（含 RPC） | `meow_` 開頭 | `meow_is_admin()`、`meow_review_verification()` |
| Trigger、Index | `meow_` 開頭 | `meow_households_limit`、`meow_cats_household_idx` |
| RLS policy | 名稱以 `meow_<表名>:` 開頭 | `"meow_cats: read visible"` |
| Storage bucket | `meow-` 開頭；policy 名稱 `meow:` 開頭 | `meow-cat-photos` |
| Migration 檔 | `supabase/migrations/NNNN_meow_<說明>.sql` | `0002_meow_posts.sql` |

> Postgres 名稱一律小寫（大寫要加引號，容易出錯）。

### 7.3 禁止事項（會影響其他 App）
- **不可**建立、修改、刪除任何不是 `meow_` 開頭的資料表、函式、trigger、policy、bucket。
- **不可**在 `auth.users` 或其他 `auth`、`storage` 系統表上加 trigger。會員資料（`meow_profiles`）由網站在第一次登入時建立。
- **不可**修改 Authentication 的 **Site URL**、Email 範本、全域 Auth 設定；只能**新增** Redirect URLs。
- **不可**執行 `drop schema`、`truncate`、不帶 `meow_` 條件的 `delete`／`update`。
- **不可**把 `service_role` 金鑰放進前端或 commit。

### 7.4 共用造成的限制
- **登入帳號共用**：同一個 Google 帳號在 MeowHome 與其他 App 是同一個 `auth.users` 使用者；MeowHome 自己的資料只存在 `meow_profiles`。
- **Google 登入設定共用**：Google 登入畫面顯示的 App 名稱可能是另一個 App；若要改，需與該 App 負責人協調。
- **容量共用**：資料庫 500 MB、檔案儲存 1 GB、每月 5 萬活躍使用者是兩個 App 加總。照片一律先縮到最長邊 1024px。
- **暫停共用**：免費專案閒置一週會被暫停；Demo、評分前要先打開確認。
- **沒有自動 migration**：SQL 由 AI 透過 Supabase 連接器執行，**執行前須把 SQL（或 migration 檔名與內容摘要）給發起人確認**；沒有連接器時由組長在 SQL Editor 手動執行。執行後在每日紀錄寫下 migration 檔名與結果，並跑一次 Supabase 安全檢查（advisors）。新 migration 必須可重複執行（`if not exists`、`drop ... if exists` 只用在 `meow_` 物件）。
- **執行紀錄**：`0001_meow.sql` 已於 2026-10-28 執行（Supabase migration 名稱 `meow_0001`）；`0002_meow_hq.sql` 已於 2026-10-29 執行（`meow_0002_hq`，先以交易 rollback 試跑通過）；`0003_meow_site_assets.sql` 已於 2026-10-29 執行（`meow_0003_site_assets`，同樣先 rollback 試跑通過）。
- **前端只用 anon key**：所有權限靠 RLS；每張 `meow_` 表都必須啟用 RLS 並寫好 policy。

### 7.5 新增資料表的流程
1. 在 `supabase/migrations/` 新增 `NNNN_meow_<說明>.sql`（遵守 7.2、7.3）
2. 每張表啟用 RLS、寫 policy；需要提權的操作用 `security definer` 函式並先檢查 `meow_is_admin()` 或擁有者
3. 更新對應 `docs/modules/*.md` 的「資料表」區與每日紀錄
4. PR 說明中註明「需要在 Supabase 執行的 SQL」；PR 合併後由 AI 經發起人確認後執行（見 7.4）
5. `npm test` 內的命名守門測試（`src/lib/db-naming.test.ts`）會擋下非 `meow_` 開頭的資料表、RPC 與 auth trigger

---

## 8. 用語

> 後台權限、帳號處置、中途徽章、虛擬體驗元件等正式名詞見根目錄 `GLOSSARY.md`。

貓戶（household）＝一位會員的貓咪之家｜貓戶長＝貓戶擁有者（飼主或中途）｜領養人＝想領養的會員｜虛擬試養＝綁定某隻待領養貓的 7 天模擬｜環境報告＝居家影片的 AI 風險報告｜週報＝AI 每週摘要｜移轉＝領養成功後貓咪所有權換到新貓戶
