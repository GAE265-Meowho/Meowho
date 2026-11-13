// 領養任務（/play）開始前的檢查：給「登入、喵戶、進行中的紀錄、房間、報告」，回傳要顯示哪一種畫面（純函式）。
// 規則見 docs/play-tasks/7-進行中續玩放棄重玩.md 第二節：不再用示範房間和規則危險當備案；只有中途喵戶的帳號不能玩。
// 示範貓、沒連資料庫（demo）照舊：直接進遊戲，不建進行中的紀錄。

export type Ready = "loading" | "none" | "pending" | "ready";

export interface GateInput {
  /** 示範貓或沒連資料庫：不建紀錄，照舊直接玩 */
  demo: boolean;
  authLoading: boolean;
  signedIn: boolean;
  /** 這隻貓是否待領養（讀不到＝false） */
  catAdoptable: boolean;
  /** 登入者名下一般飼主喵戶（cat_owner）的數量；undefined＝還在讀 */
  personalHouseholds: number | undefined;
  /** 登入者是否有任何喵戶（含中途）；undefined＝還在讀 */
  hasAnyHousehold: boolean | undefined;
  /** 自己進行中的那一筆；undefined＝還在讀，null＝沒有 */
  active: { runId: string; catId: string; catName: string } | null | undefined;
  thisCatId: string;
  /** 選定喵戶最新的 3D 房間：none＝還沒上傳或失敗、pending＝處理中 */
  room: Ready;
  /** 這間房間的居家安全報告 */
  report: Ready;
}

export type Gate =
  | { kind: "loading" }
  | { kind: "demo" }
  | { kind: "login" }
  | { kind: "not_adoptable" }
  /** 沒有任何喵戶：導去建個人喵戶 */
  | { kind: "need_household" }
  /** 只有中途喵戶：沒有自己家的 3D 房間，不能玩 */
  | { kind: "foster_only" }
  | { kind: "other_cat"; runId: string; catId: string; catName: string }
  | { kind: "resume"; runId: string }
  | { kind: "need_room" }
  | { kind: "room_pending" }
  | { kind: "need_report" }
  | { kind: "report_pending" }
  | { kind: "start" };

export function playGate(i: GateInput): Gate {
  if (i.demo) return { kind: "demo" };
  if (i.authLoading) return { kind: "loading" };
  if (!i.signedIn) return { kind: "login" };
  if (i.personalHouseholds === undefined || i.hasAnyHousehold === undefined || i.active === undefined) return { kind: "loading" };
  // 已經在做這隻貓：不管貓現在是否還待領養，都先回到進度（貓下架時資料庫會把它結束成 closed）
  if (i.active && i.active.catId === i.thisCatId) return { kind: "resume", runId: i.active.runId };
  if (!i.catAdoptable) return { kind: "not_adoptable" };
  if (i.active) return { kind: "other_cat", runId: i.active.runId, catId: i.active.catId, catName: i.active.catName };
  if (i.personalHouseholds === 0) return i.hasAnyHousehold ? { kind: "foster_only" } : { kind: "need_household" };
  if (i.room === "loading" || i.report === "loading") return { kind: "loading" };
  if (i.room === "none") return { kind: "need_room" };
  if (i.room === "pending") return { kind: "room_pending" };
  if (i.report === "none") return { kind: "need_report" };
  if (i.report === "pending") return { kind: "report_pending" };
  return { kind: "start" };
}

/** 貓咪頁「進行領養任務」按鈕：依這個人的狀態決定文字與按下去的行為 */
export type EntryState =
  | { kind: "new"; label: "進行領養任務" }
  | { kind: "continue"; label: "繼續領養任務"; runId: string }
  | { kind: "other"; label: "進行領養任務"; runId: string; catId: string; catName: string }
  | { kind: "again"; label: "再做一次領養任務"; lastDoneAt: string | null };

export function entryState(args: {
  thisCatId: string;
  active: { runId: string; catId: string; catName: string } | null;
  /** 這隻貓最近一次完成的時間；沒做完過＝null；undefined 也當沒做完過 */
  lastDoneAt?: string | null;
}): EntryState {
  const { active, thisCatId, lastDoneAt } = args;
  if (active && active.catId === thisCatId) return { kind: "continue", label: "繼續領養任務", runId: active.runId };
  if (active) return { kind: "other", label: "進行領養任務", runId: active.runId, catId: active.catId, catName: active.catName };
  if (lastDoneAt) return { kind: "again", label: "再做一次領養任務", lastDoneAt };
  return { kind: "new", label: "進行領養任務" };
}

/** 資料庫錯誤代碼 → 給玩家看的說明（meow_start_play_run、meow_complete_play_run 等） */
const ERRORS: [string, string][] = [
  ["run_cat_not_ready", "這隻貓目前不能進行領養任務。"],
  ["run_room_not_ready", "請先建立你家的 3D 房間。"],
  ["run_room_pending", "你家的 3D 房間還在處理中，好了會通知你。"],
  ["run_report_missing", "這間房間還沒有居家安全報告。"],
  ["run_report_pending", "居家安全報告還在處理中，好了會通知你。"],
  ["run_in_progress", "你正在進行另一隻貓的領養任務，要先完成或放棄。"],
  ["household_required", "請先建立個人喵戶。"],
  ["play_report_invalid", "試養報告的格式不對。"],
  ["run_not_found", "找不到進行中的任務。"],
  ["task_template_missing", "任務還在準備中，請稍後再試。"],
];
export const runErrorText = (message: string) => ERRORS.find(([k]) => message.includes(k))?.[1] ?? `操作失敗：${message}`;
