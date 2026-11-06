# 領養任務的產生接口（給渝茜的任務 worker）

> 子哲 11/6 決定：中途建完貓**不用手動出領養任務**。任務改成領養人在前台按「進行領養任務」之後才產生。
> 相關：#237（遊戲本體：到家第一天、五年後、臨終前 3 個節點）、#233 留言（遊戲開始前的初始資料草案）、migration `0030_meow_tasks_on_demand.sql`。

## 現在的流程

1. 中途建貓 → 確認 3D 模型 → 按「準備出發找新主人」。只檢查 3D 模型，不檢查任務（`meow_publish_cat`，0030）。
2. 領養人在貓咪頁按「進行領養任務」，進到 `/cats/[id]/run`，選房間後按「開始任務」。
3. 前台先呼叫 `POST /api/cats/[id]/tasks/prepare`，內容是 `{ roomId }`。
4. 伺服器執行 `prepareTasks()`（`src/lib/task-worker.ts`）：
   - 先呼叫 `requestWorker()`。**這就是要接 worker 的位置**，目前一律回 `null`。
   - 回 `null`、拋錯或逾時時，改呼叫 `meow_prepare_cat_tasks`（0030）：這隻貓還沒有任務版本，就用年齡層的系統預設任務（0018）存一版；已經有版本就回傳目前那版。
5. 拿到任務版本 id 後，前台再呼叫 `meow_start_task_run` 開始任務。後面的進度、完成和試養報告都照舊。

## 接 worker 要改的地方

只要改 `src/lib/task-worker.ts` 的 `requestWorker(req)`：

```ts
interface TaskRequest { catId: string; memberId: string; roomId: string | null }
// 產生成功：回傳存好的 meow_cat_task_versions.id
// worker 沒開、逾時或失敗：回傳 null（會自動退回系統預設任務）
```

- 輸入：哪隻貓、哪位領養人、用哪間 3D 房間。遊戲要的初始資料（玩家的家、貓、中途的要求、房間、居家危險、生活用品）照 #233 留言的表格，在 worker 裡讀，或由這裡整理好再傳給 worker。
- 輸出：worker 產生的內容要存成任務版本。內容格式要通過 `meow_task_content_error` 的檢查（每個任務要有 id、劇情、2～6 個選項，每個選項要有回饋，至少一個好的選項）。
- 版本存法：`meow_cat_task_versions` 只能由資料庫函式寫入。worker 接上時，要另外寫一支 migration 加存版本的函式（例如 `meow_save_worker_tasks`）。不要直接用 service role 改資料表。
- 這隻貓已經有任務版本時，`meow_prepare_cat_tasks` 會直接回傳舊版本。如果 worker 要每位領養人各產生一份，存版本的方式要一起調整，例如在 `meow_task_runs` 記下這位領養人自己的版本。

## 測試

- `src/lib/task-worker.test.ts`：worker 沒接、成功、失敗，三種情況的退回邏輯。
- `supabase/tests/run-pglite.mjs` 的 0030 區塊（TOD-1～8）：只確認 3D 模型就能出發、出發時不會建任務、領養人按下時用預設任務存一版且重按不會多存、準備中的貓不行、未登入不行。
