# MeowHome 協同合作分工與方式規範

> v1.0｜2026/10/28｜全體組員必讀。規範有疑問先在群組提出，由組長決定後更新本文件。

---

## 1. 角色與分工

| 代號 | 角色 | 主責模組（對應 SRS） | 支援 |
|---|---|---|---|
| A | 組長／PM | 需求與整合、分期管理、Issue 排程、簡報與 Demo；**main 分支守門員** | 測試 |
| B | 前端 | 頁面與元件（M02、M04、M06、M17 畫面）、設計系統 | AR 介面 |
| C | 後端／資料 | Supabase schema、權限、私訊、領養與移轉流程（M01、M09、M10、M11） | 部署 |
| D | AI 對話 | 對話建檔、虛擬試養劇本、內容審核（M03、M08 劇本、M16） | 知識庫 |
| E | AI 多媒體＋RAG | 照片影片轉文字、週報、配對（M05、M07） | 後端 |
| F | AR／影像生成 | 環境報告、3D／AR、虛擬貓生成（M08） | 前端 |

> 姓名請在第一次開會後填入此表。交錯式分工：每人主責一塊、支援一塊，任何人請假時由支援者接手。

### 小組
- **產品組**（A、B、C）：畫面、資料、流程
- **AI 組**（D、E、F）：所有 AI 功能
- 各設小組長；意見分歧時由組長決斷。

---

## 2. GitHub 權限設定（組長操作）

### 2.1 邀請組員
1. 開啟 repo → **Settings** → **Collaborators**（左側 Access 區）
2. 按 **Add people** → 輸入組員的 GitHub 帳號或 Email → **Add to repository**
3. 組員收到 Email 邀請後按 **Accept invitation**（7 天內有效）

> 個人帳號的 private repo，受邀者一律是可寫入的協作者（Write 權限），沒有更細的角色。若需要「唯讀」或「只能管 Issue」等角色，要把 repo 轉到 GitHub Organization。

### 2.2 保護 main 分支（強烈建議）
**Settings → Branches → Add branch ruleset**（或 Branch protection rule），目標 `main`：
- ☑ Require a pull request before merging（至少 1 位 approve）
- ☑ Require status checks to pass（選 `CI`）
- ☑ Block force pushes
- ☐ 不要勾 Allow deletions

> 注意：GitHub Free 的 **private** repo 無法強制執行 branch protection（規則可以設，但不會生效），要 public repo 或 GitHub Pro／Team 才會生效。保持 private 時，請大家**自律遵守第 4 節的流程**，main 只由組長合併。

---

## 3. 任務管理（GitHub Issues）

- 每張 Issue＝一個可以獨立 Demo 的**垂直切片**（畫面＋API＋資料＋測試都包含）。
- Issue 的「**Blocked by**」寫清楚相依的 Issue；所有 blocker 完成後才能開工。
- 標籤：
  | 標籤 | 意義 |
  |---|---|
  | `ready-for-agent` | 需求清楚，可以直接交給 AI 實作 |
  | `needs-info` | 需求還不清楚，先別動 |
  | `P1`／`P2`／`P3` | 期別 |
  | `M01`～`M17` | 模組 |
  | `bug` | 缺陷 |
- **認領**：在 Issue 右側 Assignees 指派自己，並在留言寫「開工」。一人同時最多 2 張進行中。
- 看板：Projects → 欄位「待辦 → 進行中 → 審查中 → 完成」。

---

## 4. 開發流程

```
認領 Issue → 開分支 → 開發（含測試）→ 推送 → 開 PR → CI 通過 → 1 人 review → 組長合併 → 刪分支
```

### 4.1 分支命名
`<類型>/<issue 編號>-<簡短英文>`，例如 `feat/12-cat-profile-page`、`fix/30-search-city-parse`

| 類型 | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修錯 |
| `docs` | 文件 |
| `refactor` | 重構（不改行為） |
| `test` | 只加測試 |
| `chore` | 設定、套件 |

### 4.2 Commit 訊息
`<類型>: <中文或英文簡述> (#issue)`，例如 `feat: 貓咪頁顯示本週週報 (#12)`
- 一個 commit 只做一件事；不要把格式化和功能混在一起。

### 4.3 Pull Request
- 標題同 commit 格式；內文用 PR 範本，必填：**對應 Issue**、**改了什麼**、**怎麼驗證**、**截圖（有畫面時）**。
- PR 大小：建議 400 行以內；太大請拆。
- 內文寫 `Closes #12`，合併後 Issue 自動關閉。
- 合併方式：**Squash and merge**。

### 4.4 Code Review
- 每個 PR 至少 1 位非作者 approve；**AI 相關功能請由 AI 組另一人 review**，畫面請 B 看。
- Review 看三件事：① 是否符合 Issue 的驗收條件 ② 有沒有測試 ③ 有沒有把金鑰、個資寫進程式。
- 24 小時內回覆 review 請求；有爭議面對面談，談完把結論寫回 PR。

### 4.5 保持同步
```bash
git switch main && git pull
git switch feat/12-xxx && git rebase main   # 或 git merge main
```
開工前、開 PR 前各同步一次，衝突自己解。

---

## 5. 用 AI 協作開發（Vibe Coding 規範）

我們用 Claude Code、Cursor、Codex、Antigravity 等 AI 助理寫程式，但**人要為每一行合併進 main 的程式負責**。

> 所有 AI 工具共同遵守 [`AGENTS.md`](AGENTS.md)：開工讀 `docs/agents/HANDOFF.md`、`PLAN.md` 與模組文件；收工寫 `docs/daily/` 每日紀錄（`npm run log`）、更新模組文件與交接；commit 帶 `Initiated-by`（發起的組員）與 `Agent`（AI 工具）trailer。

1. **一張 Issue 一個新對話**：開新對話，貼上 Issue 連結或內容，讓 AI 先讀 `CLAUDE.md` 與相關規格。
2. **先測試、後實作**：請 AI 先寫會失敗的測試，再寫程式讓它通過（紅 → 綠）。
3. **小步提交**：每完成一個可驗證的行為就 commit。
4. **自己跑一遍**：合併前在本機或 Codespaces 實際點過畫面；AI 說「完成了」不算數。
5. **不准貼的東西**：API 金鑰、`.env.local`、組員或使用者的個資，不可以貼進 AI 對話或 commit。
6. **改到規範或架構時**：同步更新 `CLAUDE.md`、`docs/`，讓下一個 AI 對話知道。
7. **AI 產出的提示詞**（LLM prompt）一律放在 `src/lib/prompts/`，不要散落在元件裡，方便 AI 組統一調整。

---

## 6. 程式與設計規範

- TypeScript strict；新的商業邏輯放 `src/lib/`，並附 `*.test.ts`。
- 元件放 `src/components/`；一個檔案一組相關元件。
- 樣式使用 `globals.css` 內的設計 token（`--peach`、`--mint`、`--cocoa`…），不要寫死新顏色；新元件先對照 [`docs/design/DESIGN.md`](docs/design/DESIGN.md)。
- 文案用繁體中文、口語、句子結尾不用驚嘆號堆疊；按鈕寫清楚動作（「送出申請」而不是「確定」）。
- 費用數字只能來自資料庫或公式，**不可讓 LLM 產生數字**；醫療相關文字必附「僅供參考，非醫療建議」。

---

## 7. 環境變數與金鑰

> **資料庫是與其他 App 共用的 Supabase 專案**（免費方案只能 2 個專案）：資料表一律 `meow_` 開頭、不能動其他 App 的東西。完整規範見 [`AGENTS.md` §7](AGENTS.md#7-共用資料庫規範supabase)。


- 金鑰只放 `.env.local`（已被 `.gitignore` 忽略），範本在 `.env.example`。
- 共用金鑰由組長保管，私訊給需要的人；Vercel 上的金鑰在 Vercel 專案設定裡設定。
- 不小心把金鑰推上 GitHub：**立刻通知組長並撤銷重發**，不要只刪 commit。

---

## 8. 部署

| 選項 | 費用 | 限制 |
|---|---|---|
| **Codespaces 預覽** | 免費額度內 | 只有組員能看，關掉就沒了 |
| **Vercel（repo 維持 private）** | 免費 Hobby | Hobby 方案不支援多人協作：**非 Vercel 帳號擁有者的 commit 會被擋下無法部署**。變通做法：只部署 `main`，由組長（Vercel 帳號擁有者）合併時選「Create a merge commit」，讓合併 commit 的作者是組長（通常可行，若仍被擋就改用下一列）；組員的 PR 預覽會被擋 |
| **Vercel（repo 改 public）** | 免費 | 所有人的 PR 都有預覽網址，最順；但程式碼公開（金鑰本來就不在 repo 裡） |
| Vercel Pro | 付費 | 加入成員即可 |

建議：開發期 private＋Codespaces；11/18 執行追蹤前決定是否改 public 以取得每個 PR 的預覽網址。

---

## 9. 檢查點與溝通

| 日期 | 檢查點 |
|---|---|
| 10/30 | 題目確認 |
| 11/05 | 高風險 PoC 確認 |
| 11/12 | P1 可運行 |
| 11/18 | 執行追蹤（Code Review、Demo） |
| 11/22 | P2 完成、功能凍結 |
| 11/24 | 部署、E2E 測試、Demo 彩排 |
| 11/26 | 成果報告 |

- 每週一次 30 分鐘站會：昨天做了什麼、今天要做什麼、卡在哪。
- 卡住超過半天就在群組求救，並在 Issue 留言記錄。
- 決策（例如改架構、砍功能）寫成 Issue 或 `docs/decisions/` 的短文，不要只留在聊天室。
