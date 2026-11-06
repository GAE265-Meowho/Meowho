// 領養任務的產生接口（子哲 11/6）：中途建完貓不用出任務，領養人在前台按「進行領養任務」時才產生。
// 呼叫順序：前台 /cats/[id]/run 按「開始任務」→ POST /api/cats/[id]/tasks/prepare → prepareTasks() → 回傳任務版本 id
//   → 前台再呼叫 meow_start_task_run 開始任務。
//
// 渝茜的任務 worker（#237：到家第一天、五年後、臨終前 3 個節點）接上時，只要改 requestWorker()：
//   1. 用 TaskRequest 呼叫 worker（遊戲開始前的初始資料見 #233 留言的草案）。
//   2. worker 產生的內容存成這隻貓的任務版本，回傳版本 id。
//   3. requestWorker() 回 null 時，自動退回系統預設任務（meow_prepare_cat_tasks，0030），遊戲不會因為 worker 沒開而卡住。
// 詳見 docs/modules/adoption-tasks-worker.md。

/** 產生任務需要的資訊：哪隻貓、哪位領養人、用哪間 3D 房間 */
export interface TaskRequest { catId: string; memberId: string; roomId: string | null }

export type PrepareResult = { ok: true; versionId: string; source: "worker" | "default" } | { ok: false; code: string };

/** 呼叫資料庫函式用的最小介面（伺服器端用登入者 session 的 Supabase client） */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * 預留給渝茜的任務 worker。目前還沒接上，一律回 null（改用系統預設任務）。
 * 接上後：產生成功回傳存好的任務版本 id；worker 沒開、逾時或失敗回 null。
 */
export async function requestWorker(_req: TaskRequest): Promise<string | null> {
  return null;
}

const CODES = ["login_required", "run_cat_not_ready", "task_template_missing"] as const;
const codeOf = (message: string) => CODES.find(c => message.includes(c)) ?? "prepare_failed";

/** 準備這隻貓的領養任務：先問 worker，沒有就用系統預設任務 */
export async function prepareTasks(sb: RpcClient, req: TaskRequest, worker: (r: TaskRequest) => Promise<string | null> = requestWorker): Promise<PrepareResult> {
  try {
    const versionId = await worker(req);
    if (versionId) return { ok: true, versionId, source: "worker" };
  } catch (e) {
    console.warn("[tasks/prepare] 任務 worker 失敗，改用系統預設任務：", e instanceof Error ? e.message : e);
  }
  const { data, error } = await sb.rpc("meow_prepare_cat_tasks", { p_cat_id: req.catId });
  if (error) return { ok: false, code: codeOf(error.message) };
  if (typeof data !== "string") return { ok: false, code: "prepare_failed" };
  return { ok: true, versionId: data, source: "default" };
}
