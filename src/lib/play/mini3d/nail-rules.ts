/** 剪指甲（虛擬飼養第 2 份）的規則：只算哪一根指甲伸出來、剪在哪、貓還忍不忍得住，不碰畫面。
 *  玩法：一隻手按住腳趾（指甲才伸出來），另一隻手把指甲刀拖到指甲上，放開就剪。
 *  回傳格式照總表：{ score, bleed, bitten, ran }（careGood("nail") 要都沒發生且 score ≥ 60）。 */

/** 一隻前腳剪幾根（不含懸趾，特寫看得清楚） */
export const NAIL_COUNT = 4;
/** 剪的深度：0＝指甲尖、1＝指甲根部。QUICK 以後是血線（粉紅色），剪到會流血；TIP 以前只剪到一點點尖端 */
export const NAIL_QUICK = 0.55, NAIL_TIP = 0.14;
/** 最剛好的位置：血線前留一點距離 */
const IDEAL = 0.38;
/** 貓抽腳幾次以後就不給剪了（咬人或跑掉） */
export const NAIL_MAX_PULLS = 3;
/** 抽腳後幾秒內按不住腳趾 */
const PULL_SECONDS = 1.1;
/** 忍耐到這裡會抽腳；到 100 直接咬人或跑掉 */
const PULL_AT = 55;

export type NailCut = "tip" | "good" | "bleed";
export interface Claw { cut: NailCut | null; /** 剪在哪（0～1），還沒剪是 null */ depth: number | null }
export interface NailState {
  claws: Claw[];
  /** 正按住哪一根腳趾（指甲伸出來），沒按是 null */
  held: number | null;
  /** 貓的不耐煩（0～100）：按著腳趾會慢慢上升，放開會下降 */
  resist: number;
  /** 抽腳幾次了；pulledFor＝還要幾秒才能再按 */
  pulls: number;
  pulledFor: number;
  bleed: boolean;
  /** 結束的原因：done 全部剪完、bitten 被咬、ran 貓跑掉、stop 玩家自己停手 */
  end: "done" | "bitten" | "ran" | "stop" | null;
}
export type NailEvent = "press" | "blocked" | "tip" | "good" | "bleed" | "miss" | "pull" | "bitten" | "ran" | "done" | null;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const newNail = (): NailState => ({
  claws: Array.from({ length: NAIL_COUNT }, () => ({ cut: null, depth: null })),
  held: null, resist: 0, pulls: 0, pulledFor: 0, bleed: false, end: null,
});

/** 依信任、壓力（0～100）算難度：rise＝按著腳趾時每秒上升多少不耐煩；信任低或壓力高升得快 */
export function nailDifficulty(cat: { trust: number; stress: number }): { rise: number; calm: number } {
  const rise = clamp(9 - (cat.trust - 50) * 0.1 + (cat.stress - 50) * 0.1, 3, 20);
  return { rise, calm: clamp(14 - rise * 0.4, 6, 14) };
}

/** 按住一根腳趾：指甲伸出來。剪過的、貓剛抽腳的時候按不了 */
export function nailPress(s: NailState, toe: number): { state: NailState; event: NailEvent } {
  if (s.end || !s.claws[toe]) return { state: s, event: null };
  if (s.pulledFor > 0 || s.claws[toe].cut) return { state: s, event: "blocked" };
  return { state: { ...s, held: toe }, event: s.held === toe ? null : "press" };
}
export const nailRelease = (s: NailState): NailState => (s.held === null ? s : { ...s, held: null });

/** 這個深度會剪出什麼結果 */
export const cutKind = (depth: number): NailCut => (depth > NAIL_QUICK ? "bleed" : depth < NAIL_TIP ? "tip" : "good");
/** 一根指甲的分數（0～1）：剪到血線 0、只剪尖端 0.5、剛好的範圍裡越靠近 IDEAL 越高（0.7～1） */
export function clawScore(c: Claw): number {
  if (!c.cut || c.depth === null || c.cut === "bleed") return 0;
  if (c.cut === "tip") return 0.5;
  return clamp(1 - Math.abs(c.depth - IDEAL) * 1.5, 0.7, 1);
}

/** 放開指甲刀＝剪下去。toe＝指甲刀對到哪一根（沒對到是 null）、depth＝剪在那根的哪裡。只有正按著的那一根剪得到 */
export function nailClip(s: NailState, toe: number | null, depth: number, cat: { trust: number; stress: number }): { state: NailState; event: NailEvent } {
  if (s.end) return { state: s, event: null };
  if (s.pulledFor > 0) return { state: s, event: "blocked" };
  if (toe === null || toe !== s.held || s.claws[toe].cut) return { state: s, event: "miss" };
  const d = clamp(depth, 0, 1), cut = cutKind(d);
  const claws = s.claws.map((c, i) => (i === toe ? { cut, depth: d } : c));
  const { rise } = nailDifficulty(cat);
  // 剪一刀貓會緊張一下；剪到血線大幅上升
  const next: NailState = { ...s, claws, held: null, bleed: s.bleed || cut === "bleed", resist: clamp(s.resist + rise * 0.8 + (cut === "bleed" ? 35 : 0), 0, 100) };
  if (next.resist < 100 && claws.every(c => c.cut)) return { state: { ...next, end: "done" }, event: cut === "bleed" ? "bleed" : "done" };
  return { state: next, event: cut };
}

/** 每一格：按著腳趾不耐煩上升，放開下降；太不耐煩就抽腳，抽太多次或到 100 就咬人或跑掉（一半一半） */
export function nailTick(s: NailState, dt: number, cat: { trust: number; stress: number }, rand: () => number = Math.random): { state: NailState; event: NailEvent } {
  if (s.end) return { state: s, event: null };
  const { rise, calm } = nailDifficulty(cat);
  const resist = clamp(s.resist + (s.held === null ? -calm : rise) * dt, 0, 100);
  const next: NailState = { ...s, resist, pulledFor: Math.max(0, s.pulledFor - dt) };
  const giveUp = (): { state: NailState; event: NailEvent } => {
    const end = rand() < 0.5 ? "bitten" : "ran";
    return { state: { ...next, held: null, end }, event: end };
  };
  if (resist >= 100) return giveUp();
  if (s.held !== null && resist >= PULL_AT && next.pulledFor === 0) {
    if (s.pulls + 1 > NAIL_MAX_PULLS) return giveUp();
    // 抽腳：指甲縮回去，要等一下再重按；不耐煩退一些，不然會連續抽
    return { state: { ...next, held: null, pulls: s.pulls + 1, pulledFor: PULL_SECONDS, resist: resist - 15 }, event: "pull" };
  }
  return { state: next, event: null };
}

export const nailStop = (s: NailState): NailState => (s.end ? s : { ...s, held: null, end: "stop" });
export const nailCutCount = (s: NailState) => s.claws.filter(c => c.cut).length;

export function nailResult(s: NailState): { score: number; bleed: boolean; bitten: boolean; ran: boolean } {
  const score = Math.round(s.claws.reduce((a, c) => a + clawScore(c), 0) / s.claws.length * 100);
  return { score, bleed: s.bleed, bitten: s.end === "bitten", ran: s.end === "ran" };
}

export const NAIL_TEXT: Record<Exclude<NailEvent, null>, string> = {
  press: "指甲伸出來了。把指甲刀拖到白色尖端，放開就剪。",
  blocked: "牠把腳抽回去了，等牠放鬆再按。",
  tip: "只剪到一點點尖端。",
  good: "喀！剪得剛剛好。",
  bleed: "剪到血線，流血了！牠痛得尖叫、對你哈氣。",
  miss: "沒剪到。先按住腳趾讓指甲伸出來，再對準那一根。",
  pull: "牠把腳抽回去了！先放開，等牠放鬆。",
  bitten: "牠受不了，回頭咬了你一口。",
  ran: "牠掙脫跑走了。",
  done: "全部剪好了！",
};

/** 貓掌毛色：貓的花色文字（meow_cats.coat，自由填寫）對到五種常見毛色；對不到用虎斑 */
export type PawCoat = "orange" | "black" | "white" | "tabby" | "calico";
export function pawCoat(coat: string | null | undefined): PawCoat {
  const c = coat ?? "";
  if (/三花|玳瑁|三色/.test(c)) return "calico";
  if (/橘|橙|黃|茶/.test(c)) return "orange";
  if (/黑|賓士|乳牛/.test(c)) return "black";
  if (/白/.test(c)) return "white";
  return "tabby";
}
