// 虛擬飼養：今日照顧狀態（#354 渝茜「遊戲的感測要做好」）。純函式。
// 一個節點＝一天：節點之間跨日（劇本每個節點的 age 都不同），同一個節點裡的劇情小遊戲與「在家的時光」算同一天。
// 同一天裡：碗裡倒了多少飼料、換過的水、砂盆剩幾坨都維持，再進小遊戲時場景照這個樣子；隔天（進下一個節點）碗清空、水要換、砂盆又有新的砂團。
// done＝今天已經做好的照顧：再做一次不給獎勵、不再記一次（在家的時光圖示也顯示做過）。
// 存檔（save.ts）：放在節點快照 Checkpoint.today 裡，只有數字與動作代號。
import { careGood, type CareAct } from "./care";
import { scoopOutcome } from "./mini3d/scoop-rules";

export interface CareDay {
  /** 哪一天（節點序號） */
  node: number;
  /** 碗裡的飼料：乾飼料量、主食罐與湯罐各倒了幾罐（同 feed-rules 的 FeedState，不含灑出去的） */
  feed: { dry: number; wet: number; soup: number };
  /** 今天換的新水有多少（0＝今天還沒換） */
  water: number;
  /** 砂盆還剩幾坨；null＝今天還沒看過砂盆（照髒的程度產生新的砂團） */
  litter: number | null;
  /** 今天已經做好的照顧 */
  done: CareAct[];
}

export const newDay = (node: number): CareDay => ({ node, feed: { dry: 0, wet: 0, soup: 0 }, water: 0, litter: null, done: [] });

const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);

/** 小遊戲結束後，今天的狀態照實際結果更新；null（中途關掉）不改 */
export function dayAfter(day: CareDay, act: CareAct, result: unknown): CareDay {
  const r = obj(result);
  if (!r) return day;
  const next: CareDay = { ...day, feed: { ...day.feed }, done: [...day.done] };
  if (act === "feed") { const b = obj(r.bowl); if (b) next.feed = { dry: n(b.dry), wet: n(b.wet), soup: n(b.soup) }; }
  if (act === "water" && n(r.fill) > 0) next.water = n(r.fill);
  if (act === "scoop") { const o = scoopOutcome(r); if (o.left !== null && (o.kind !== "none" || day.litter === null)) next.litter = o.left; }
  if (careGood(act, result) && !next.done.includes(act)) next.done.push(act);
  return next;
}

const ACTS: readonly CareAct[] = ["play", "pet", "feed", "water", "scoop", "nail", "brush"];

/** 讀存檔：格式不對或不是這一天，就當新的一天 */
export function parseDay(raw: unknown, node: number): CareDay {
  const r = obj(raw), f = obj(r?.feed);
  if (!r || r.node !== node || !f) return newDay(node);
  return {
    node, feed: { dry: n(f.dry), wet: n(f.wet), soup: n(f.soup) }, water: n(r.water),
    litter: typeof r.litter === "number" && r.litter >= 0 ? Math.round(r.litter) : null,
    done: Array.isArray(r.done) ? (r.done.filter(a => ACTS.includes(a as CareAct)) as CareAct[]) : [],
  };
}
