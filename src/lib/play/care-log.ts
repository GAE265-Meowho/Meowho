// 照顧紀錄（#354，渝茜 2026-11-18）：記下玩家每一天每個照顧動作「做了什麼、做得怎樣」，不只花費。
// 例：倒了建議份量的幾成、有沒有灑出來、換水有沒有刷碗、還剩幾坨沒鏟、有沒有剪到血線、哪幾天沒換水。
// 試養報告的「每天有沒有做到」與四個面向從這裡算（report-analysis.ts）。純函式；存檔只存短字串與數字。
import type { CareAct } from "./care";
import { scoopOutcome } from "./mini3d/scoop-rules";
import type { NodeId } from "./story";

/** good＝做好了（✓）、meh＝做了但不夠好（△）、skip＝沒做或打開又關掉（✕） */
export type CareMark = "good" | "meh" | "skip";

export interface CareEntry {
  node: NodeId;
  act: CareAct;
  out: CareMark;
  /** 一句話細節（給報告看） */
  d: string;
  /** 牠跑走、被咬、剪到血線（「讀懂牠」用） */
  hurt?: boolean;
  /** 餵飯：倒了建議份量的幾 %（四捨五入） */
  pct?: number;
}

type R = Record<string, unknown> | null;
const obj = (v: unknown): R => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
const n = (r: R, k: string) => (r && typeof r[k] === "number" && Number.isFinite(r[k]) ? (r[k] as number) : 0);
const flag = (r: R, k: string) => Boolean(r && r[k]);

/** 小遊戲結果 → 一筆紀錄。result＝null 表示打開後關掉、沒做 */
export function careEntry(node: NodeId, act: CareAct, result: unknown): CareEntry {
  const r = obj(result);
  const base = { node, act };
  const skip = (d: string): CareEntry => ({ ...base, out: "skip", d });
  if (!r) return skip("打開後關掉了");
  switch (act) {
    case "feed": {
      const added = n(r, "added"), total = n(r, "total") || added, portion = n(r, "portion");
      if (added <= 0) return skip("打開後沒有倒");
      const pct = portion > 0 ? Math.round((total / portion) * 100) : undefined;
      const of = pct !== undefined ? `（建議份量的 ${pct}%）` : "";
      if (n(r, "spill") >= 1.5) return { ...base, out: "meh", d: `倒太滿，灑出來了${of}`, pct };
      if (r.over === true) return { ...base, out: "meh", d: `倒太多${of}`, pct };
      if (total < 15 || (pct !== undefined && pct < 80)) return { ...base, out: "meh", d: `倒太少${of}`, pct };
      return { ...base, out: "good", d: `份量剛好${of}`, pct };
    }
    case "water": {
      const fill = Math.round(n(r, "fill"));
      if (fill <= 0) return skip("沒有接新水");
      if (fill < 70) return { ...base, out: "meh", d: `水只裝到 ${fill}%` };
      if (r.washed === false) return { ...base, out: "meh", d: "換了新水，但碗沒刷乾淨" };
      return { ...base, out: "good", d: "刷乾淨碗、換了新水" };
    }
    case "scoop": {
      const o = scoopOutcome(r);
      if (o.kind === "good") return { ...base, out: "good", d: "鏟乾淨了" };
      if (o.kind === "partial") return { ...base, out: "meh", d: `還有 ${o.left} 坨沒鏟` };
      return skip("沒有鏟");
    }
    case "pet": {
      if (flag(r, "ran")) return { ...base, out: "meh", d: "摸太久或摸錯地方，牠跑走了", hurt: true };
      return n(r, "fun") >= 50 ? { ...base, out: "good", d: "牠很舒服" } : { ...base, out: "meh", d: "牠還不太開心" };
    }
    case "play": return n(r, "fun") >= 50 ? { ...base, out: "good", d: "玩得很開心" } : n(r, "fun") > 0 ? { ...base, out: "meh", d: "玩得不夠久" } : skip("沒有玩");
    case "nail": {
      if (flag(r, "bleed")) return { ...base, out: "meh", d: "剪到血線，流血了", hurt: true };
      if (flag(r, "bitten")) return { ...base, out: "meh", d: "牠不耐煩，咬了你", hurt: true };
      if (flag(r, "ran")) return { ...base, out: "meh", d: "牠跑掉了", hurt: true };
      return n(r, "score") >= 60 ? { ...base, out: "good", d: "剪得剛剛好" } : n(r, "score") > 0 ? { ...base, out: "meh", d: "只剪了一點" } : skip("沒有剪");
    }
    case "brush": {
      if (flag(r, "bitten")) return { ...base, out: "meh", d: "牠抗拒時沒放手，咬了你", hurt: true };
      if (flag(r, "ran")) return { ...base, out: "meh", d: "牠受不了跑掉了", hurt: true };
      return n(r, "score") >= 60 ? { ...base, out: "good", d: "刷乾淨了" } : n(r, "score") > 0 ? { ...base, out: "meh", d: "只刷了一點" } : skip("沒有刷");
    }
  }
}

const RANK: Record<CareMark, number> = { skip: 0, meh: 1, good: 2 };

/** 同一天同一個動作只留一筆：做得比較好的那次（一樣好就留最新的）；「讀懂牠」的跑走、被咬留著 */
export function logCare(log: readonly CareEntry[], e: CareEntry): CareEntry[] {
  const i = log.findIndex(x => x.node === e.node && x.act === e.act);
  if (i < 0) return [...log, e];
  const old = log[i];
  const keep = RANK[e.out] >= RANK[old.out] ? e : old;
  const merged = { ...keep, hurt: old.hurt || e.hurt || undefined };
  if (!merged.hurt) delete merged.hurt;
  return log.map((x, j) => (j === i ? merged : x));
}

/** 在家的時光結束：這一天沒做的動作記「沒做」 */
export function logSkips(log: readonly CareEntry[], node: NodeId, acts: readonly CareAct[]): CareEntry[] {
  return acts.reduce<CareEntry[]>((l, act) => (l.some(x => x.node === node && x.act === act) ? l : [...l, { node, act, out: "skip", d: "這天沒做" }]), [...log]);
}

/** 讀存檔：只留格式對的 */
export function parseCareLog(raw: unknown): CareEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is CareEntry => {
    const o = obj(x);
    return !!o && typeof o.node === "string" && typeof o.act === "string" && (o.out === "good" || o.out === "meh" || o.out === "skip") && typeof o.d === "string";
  }).map(x => ({ ...x, d: x.d.slice(0, 40) }));
}
