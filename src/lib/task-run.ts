// 領養人進行領養任務（規格 09 §7.3）：家具替換規則、進度、放棄理由。進度存在 meow_task_runs.progress（0017）。
// progress：{"done": [任務 id], "choices": {任務 id: [選過的選項序號]}, "day": 目前第幾天}
import type { Need, Task, TaskContent } from "./adoption-tasks";

export interface RunProgress { done: string[]; choices: Record<string, number[]>; day?: number }

export function parseProgress(raw: unknown): RunProgress {
  const p = (raw ?? {}) as Partial<RunProgress>;
  return {
    done: Array.isArray(p.done) ? p.done.filter((x): x is string => typeof x === "string") : [],
    choices: p.choices && typeof p.choices === "object" ? p.choices : {},
    ...(typeof p.day === "number" ? { day: p.day } : {}),
  };
}

// 任務需要的家具或物品：房間裡沒有時依序找功能相近的（§7.3 替換規則）；都找不到就只有文字情境
const REPLACE: Record<Need, { find: string; show: string }[]> = {
  sofa: [{ find: "沙發", show: "沙發" }, { find: "床", show: "床" }, { find: "櫃", show: "櫃子" }, { find: "椅", show: "椅子" }],
  high_place: [{ find: "櫃", show: "櫃子" }, { find: "書桌", show: "書桌" }, { find: "電視櫃", show: "電視櫃" }, { find: "流理台", show: "流理台" }],
  hiding_spot: [{ find: "床", show: "床底" }, { find: "衣櫃", show: "衣櫃旁" }, { find: "沙發", show: "沙發後" }],
  table_item: [{ find: "桌", show: "桌上的東西" }],
  door: [{ find: "門", show: "門" }],
};

/** 這間房裡用來演這個需求的東西；沒有就回傳 null */
export function placeFor(need: Need, furniture: string[]): string | null {
  for (const r of REPLACE[need]) if (furniture.some(f => f.includes(r.find))) return r.show;
  return null;
}

/** 這個任務在這間房裡怎麼演：用到哪些東西、是不是只能用文字情境 */
export function taskScene(task: Pick<Task, "needs">, furniture: string[]): { items: string[]; textOnly: boolean } {
  const items = task.needs.map(n => placeFor(n, furniture));
  return { items: items.filter((x): x is string => Boolean(x)), textOnly: items.some(x => x === null) };
}

/** 下一個要做的任務（依天數，跳過做完的） */
export const nextTask = (c: TaskContent, p: RunProgress) => c.tasks.find(t => !p.done.includes(t.id)) ?? null;
export const isComplete = (c: TaskContent, p: RunProgress) => c.tasks.length > 0 && c.tasks.every(t => p.done.includes(t.id));

/** 選一個做法：記下選過的；選對才算這個任務完成，選錯可以重選 */
export function choose(p: RunProgress, task: Task, index: number): { progress: RunProgress; good: boolean } {
  const option = task.options[index];
  const good = Boolean(option?.good);
  const picked = [...(p.choices[task.id] ?? []), index];
  return {
    good,
    progress: {
      done: good && !p.done.includes(task.id) ? [...p.done, task.id] : p.done,
      choices: { ...p.choices, [task.id]: picked },
      day: task.day,
    },
  };
}

export const ABANDON_REASONS = [
  { key: "no_time", label: "時間不夠" },
  { key: "not_ready", label: "覺得自己還沒準備好" },
  { key: "not_a_fit", label: "覺得不適合這隻貓" },
  { key: "try_other_cat", label: "想先試別隻貓" },
  { key: "too_hard", label: "任務太難" },
  { key: "other", label: "其他" },
] as const;
export type AbandonReason = (typeof ABANDON_REASONS)[number]["key"];
export const reasonLabel = (k: string) => ABANDON_REASONS.find(r => r.key === k)?.label ?? k;

/** 放棄的理由必選，「其他」要寫說明（和資料庫 meow_abandon_task_run 相同） */
export function abandonMissing(reasons: string[], note: string): string | null {
  if (!reasons.length) return "請選擇放棄的原因";
  if (reasons.includes("other") && !note.trim()) return "選「其他」時請寫下原因";
  return null;
}

/** 試養報告的摘要：每個任務第一次就選對、或重選了幾次 */
export function proofLines(c: TaskContent, p: RunProgress): { title: string; day: number; tries: number; chosen: string | null }[] {
  return c.tasks.map(t => {
    const picks = p.choices[t.id] ?? [];
    const last = picks.at(-1);
    return { title: t.title || `第 ${t.day} 天`, day: t.day, tries: picks.length, chosen: last === undefined ? null : t.options[last]?.text ?? null };
  });
}

// ---------- 預設房間（前台建立我的 3D 房間做好前先用） ----------
/** 預設房間的家具（用來套替換規則）；接真正的房間時改讀房間轉換結果裡的物品 */
export const DEFAULT_ROOM_FURNITURE = ["沙發", "床", "衣櫃", "書桌", "椅子", "門"];

const pad = (n: number) => String(n).padStart(2, "0");
export const roomIdAt = (d: Date) =>
  `room_${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

/** 房間的家具清單：預設房間在 meta.furniture；房間轉換的結果在 meta.objects[].label */
export function roomFurniture(meta: unknown): string[] {
  const m = (meta ?? {}) as { furniture?: unknown; objects?: { label?: unknown }[] };
  if (Array.isArray(m.furniture)) return m.furniture.filter((x): x is string => typeof x === "string");
  if (Array.isArray(m.objects)) return m.objects.map(o => o?.label).filter((x): x is string => typeof x === "string");
  return [];
}
