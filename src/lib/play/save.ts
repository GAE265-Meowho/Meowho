// 領養任務（/play）存檔：每過一個節點把「節點開始前的快照」連同採買、擺放一起存進 meow_task_runs.progress（本人可直接 update，上限約 50 KB）。
// 續玩時從那個節點的開頭重新開始，節點裡玩到一半的小遊戲會重玩（docs/play-tasks/7-進行中續玩放棄重玩.md 第二節第 4 點）。純函式。
import type { Checkpoint } from "./flow";
import { STORY } from "./story";

/** 資料庫的上限是 50000 位元組；留一點空間 */
export const PROGRESS_LIMIT = 45_000;

export interface SavedRun<Pick = unknown, Placed = unknown> {
  v: 1;
  /** 節點開始前的快照（信任、壓力、選過的選項、花費、照顧紀錄、居家危險…） */
  cp: Checkpoint;
  /** 採買的選擇 */
  pick: Pick;
  /** 娃娃屋擺放的用品（掃描房間用 scanSpots） */
  placed: Placed[];
  /** 掃描房間：用品放在哪個家具旁 */
  scanSpots: Record<string, string>;
  /** 玩的是哪個喵戶 */
  hhId: string | null;
  savedAt: string;
}

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/** 組成要存的進度；太大時依序縮短會一直長的欄位（選過的選項、紀錄、事件） */
export function buildProgress<Pick, Placed>(a: { cp: Checkpoint; pick: Pick; placed: Placed[]; scanSpots: Record<string, string>; hhId: string | null; now?: Date }): SavedRun<Pick, Placed> {
  const out: SavedRun<Pick, Placed> = { v: 1, cp: a.cp, pick: a.pick, placed: a.placed, scanSpots: a.scanSpots, hhId: a.hhId, savedAt: (a.now ?? new Date()).toISOString() };
  if (bytes(out) <= PROGRESS_LIMIT) return out;
  const life = out.cp.life;
  const tight = (keep: number, len: number): SavedRun<Pick, Placed> => ({
    ...out,
    cp: { ...out.cp, life: {
      ...life,
      picks: life.picks.slice(-keep).map(p => ({ ...p, t: p.t.slice(0, len) })),
      notes: life.notes.slice(-keep).map(n => ({ ...n, t: n.t.slice(0, len) })),
      events: life.events.slice(-keep).map(e => ({ ...e, t: e.t.slice(0, len) })),
    } },
  });
  for (const [keep, len] of [[60, 120], [30, 80], [10, 40]] as const) {
    const t = tight(keep, len);
    if (bytes(t) <= PROGRESS_LIMIT) return t;
  }
  return tight(0, 0);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** 讀回進度：格式不對（舊資料、空的）回傳 null，畫面就從頭開始 */
export function parseSaved(raw: unknown): SavedRun | null {
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.cp)) return null;
  const cp = raw.cp;
  const life = cp.life;
  if (cp.v !== 1 || !Number.isInteger(cp.nodeIndex) || (cp.nodeIndex as number) < 0 || (cp.nodeIndex as number) >= STORY.length) return null;
  if (!isObj(life) || typeof life.name !== "string" || typeof life.trust !== "number" || typeof life.stress !== "number" || !isObj(life.cost) || !isObj(life.care)) return null;
  if (!Array.isArray(life.picks) || !Array.isArray(life.notes) || !Array.isArray(life.events) || !Array.isArray(life.labels)) return null;
  if (typeof cp.monthly !== "number" || typeof cp.startMonths !== "number" || !Array.isArray(cp.hazards) || !Array.isArray(cp.handled)) return null;
  const spots = isObj(raw.scanSpots) ? Object.fromEntries(Object.entries(raw.scanSpots).filter(([, v]) => typeof v === "string")) as Record<string, string> : {};
  return {
    v: 1, cp: cp as unknown as Checkpoint, pick: raw.pick ?? null, placed: Array.isArray(raw.placed) ? raw.placed : [], scanSpots: spots,
    hhId: typeof raw.hhId === "string" ? raw.hhId : null, savedAt: typeof raw.savedAt === "string" ? raw.savedAt : "",
  };
}

/** 浮動按鈕顯示用：「妹妹的任務 2／7」。nodeIndex 從 0 算，節點總數＝劇本的節點數 */
export function progressLabel(catName: string, raw: unknown): string {
  const saved = parseSaved(raw);
  const total = STORY.length;
  return `${catName}的任務 ${Math.min(total, (saved?.cp.nodeIndex ?? 0) + 1)}／${total}`;
}
