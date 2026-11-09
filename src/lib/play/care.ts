// 虛擬飼養 DEMO（#237）：「在家的時光」。每個節點結束後回到房間，6 個動作每輪各最多做一次，累積 6 個數值。
// 設計稿：newgame/nodes.md「在家的時光」。數字是暫定值（沿用 catgame 原型），上線前要和組員確認。純函式。
// 不做房間物品互動：動作都是按鈕加小遊戲，貓在背景。這些動作不花錢（花費只來自劇情裡的明確支出）。
import type { Care, Fx } from "./story";

export type CareAct = "play" | "feed" | "water" | "scoop" | "nail" | "brush";

export const CARE_ACTS: readonly { act: CareAct; label: string; mini: "play" | "feed" | "water" | "scoop" | "nail" | "brush" }[] = [
  { act: "play", label: "逗貓", mini: "play" },
  { act: "feed", label: "餵貓", mini: "feed" },
  { act: "water", label: "換水", mini: "water" },
  { act: "scoop", label: "鏟屎", mini: "scoop" },
  { act: "nail", label: "剪指甲", mini: "nail" },
  { act: "brush", label: "刷牙", mini: "brush" },
];

export const newCare = (): Care => ({ weight: 50, water: 50, hygiene: 50, teeth: 50, log: {}, rounds: 0 });

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** 做完一個動作的效果。good＝小遊戲成功；brushDaily＝節點 3 選了「每天練刷牙」（牙齒值加成） */
export function careEffect(act: CareAct, good: boolean, brushDaily: boolean): { d: Partial<Pick<Care, "weight" | "water" | "hygiene" | "teeth">>; fx: Fx } {
  switch (act) {
    case "play": return { d: {}, fx: good ? { trust: 4, stress: -5 } : { trust: 1 } };
    case "feed": return { d: good ? {} : { weight: 8 }, fx: {} };
    case "water": return { d: { water: good ? 10 : 3 }, fx: {} };
    case "scoop": return { d: { hygiene: 10 }, fx: { stress: -2 } };
    case "nail": return { d: {}, fx: { trust: good ? 2 : -3 } };
    case "brush": return { d: { teeth: good ? 10 + (brushDaily ? 5 : 0) : 3 }, fx: {} };
  }
}

/** 這一輪沒做的動作：換水、鏟屎、刷牙數值下降；逗貓沒做壓力慢慢上升 */
export function skipEffect(act: CareAct): { d: Partial<Pick<Care, "water" | "hygiene" | "teeth">>; fx: Fx } {
  switch (act) {
    case "water": return { d: { water: -5 }, fx: {} };
    case "scoop": return { d: { hygiene: -8 }, fx: { stress: 3 } };
    case "brush": return { d: { teeth: -5 }, fx: {} };
    case "play": return { d: {}, fx: { stress: 2 } };
    default: return { d: {}, fx: {} };
  }
}

export function addCare(c: Care, d: Partial<Pick<Care, "weight" | "water" | "hygiene" | "teeth">>): Care {
  return {
    ...c,
    weight: clamp(c.weight + (d.weight ?? 0)), water: clamp(c.water + (d.water ?? 0)),
    hygiene: clamp(c.hygiene + (d.hygiene ?? 0)), teeth: clamp(c.teeth + (d.teeth ?? 0)),
  };
}

type Result = Record<string, unknown> | null;
const num = (r: Result, k: string) => (r && typeof r[k] === "number" ? (r[k] as number) : 0);

/** 小遊戲結果（原版 catgame 的格式）→ 成功與否。play：開心分數 50 以上；scoop：一律算做了；
 *  feed：倒到建議份量附近（15 以上）、沒倒太多、灑出去不到 1.5 秒；water：水裝到 70 以上；
 *  nail：沒剪到血線、沒被咬、沒跑掉、剪好 60 分以上；brush：沒被咬、沒跑掉、完成度 60 分以上；中途取消（null）都算沒做好 */
export function careGood(act: CareAct, result: unknown): boolean {
  const r: Result = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
  switch (act) {
    case "play": return num(r, "fun") >= 50;
    case "scoop": return true;
    case "feed": return Boolean(r) && r!.over !== true && num(r, "added") >= 15 && num(r, "spill") < 1.5;
    case "water": return num(r, "fill") >= 70;
    case "nail": return Boolean(r) && !r!.bleed && !r!.bitten && !r!.ran && num(r, "score") >= 60;
    case "brush": return Boolean(r) && !r!.bitten && !r!.ran && num(r, "score") >= 60;
  }
}
