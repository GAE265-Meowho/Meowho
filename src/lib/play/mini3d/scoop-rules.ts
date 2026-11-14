/** 3D 鏟屎（虛擬飼養第 1 份）的規則：只算哪一塊在砂裡、在鏟子上、在垃圾袋裡，不碰 3D。玩法照 2D 版（catgame/minis.ts 的 startScoop）。單位公尺。 */

/** 貓砂盆四款（採買的四個選項）：開放式、有蓋、大尺寸、幼貓小尺寸。w 寬、d 深、h 盆壁高 */
export type LitterBoxKind = "open" | "covered" | "large" | "kitten";
export const LITTER_BOXES: Record<LitterBoxKind, { name: string; w: number; d: number; h: number }> = {
  open: { name: "開放式", w: 0.5, d: 0.34, h: 0.12 },
  covered: { name: "有蓋", w: 0.5, d: 0.38, h: 0.14 },
  large: { name: "大尺寸", w: 0.62, d: 0.44, h: 0.14 },
  kitten: { name: "幼貓小尺寸", w: 0.38, d: 0.28, h: 0.07 },
};
/** 大便、結塊離盆壁至少多遠 */
const EDGE = 0.06;
/** 鏟子一次最多載幾塊；鏟子離多近算鏟到（再加上那一塊的半徑）；移動超過這個速度（公尺／秒）鏟子上的東西會掉 */
export const SCOOP_MAX = 3;
const REACH = 0.035;
export const SCOOP_TOO_FAST = 2.5;
/** 左右移動超過這個速度（公尺／秒）才算在甩；每換一次方向甩掉多少砂（1 是整鏟的砂），大約甩三下乾淨 */
const SHAKE_SPEED = 0.15, SHAKE_SIFTS = 0.34;
/** 鏟子上的砂低於這個量算甩乾淨了 */
export const SAND_CLEAN = 0.05;

export interface Clump {
  x: number; z: number;
  /** 半徑；大便是一條、結塊是一坨 */
  r: number; poop: boolean;
  /** 在砂上轉的角度（弧度） */
  rot: number;
  at: "sand" | "scoop" | "bag";
}
export interface ScoopState {
  clumps: Clump[];
  bagged: number;
  /** 鏟子上還有多少砂（0～1）：鏟起來時連砂一起，是 1；左右甩會漏掉 */
  sand: number;
  /** 上一次甩的方向（-1 左、1 右、0 還沒動） */
  dir: number;
  /** 沒甩乾淨就丟、連砂一起丟掉了幾塊 */
  wasted: number;
}
export type ScoopEvent = "pick" | "pickPoop" | "shake" | "sifted" | "tooFast" | "dropped" | "bagged" | "baggedSandy" | null;

/** 砂盆髒的程度（0～100）決定有幾塊：每 12 一塊、1～8 塊，每三塊有一條大便；低於 5 就是乾淨的 */
export const clumpCount = (dirt: number) => (dirt < 5 ? 0 : Math.min(8, Math.max(1, Math.round(dirt / 12))));
/** count：同一天再進來時砂盆剩幾坨（見 lib/play/care-day.ts）；沒給就照髒的程度算 */
export function makeClumps(box: LitterBoxKind, dirt = 70, rand: () => number = Math.random, count?: number): Clump[] {
  const n = count ?? clumpCount(dirt);
  const { w, d } = LITTER_BOXES[box];
  return Array.from({ length: n }, (_, i) => {
    const poop = i % 3 === 2;
    return {
      x: (rand() - 0.5) * (w - EDGE * 2), z: (rand() - 0.5) * (d - EDGE * 2),
      r: poop ? 0.016 : 0.018 + rand() * 0.008, poop, rot: rand() * Math.PI, at: "sand" as const,
    };
  });
}
export const newScoop = (box: LitterBoxKind, dirt = 70, rand: () => number = Math.random, count?: number): ScoopState =>
  ({ clumps: makeClumps(box, dirt, rand, count), bagged: 0, sand: 0, dir: 0, wasted: 0 });

const within = (v: number, half: number) => Math.min(half, Math.max(-half, v));
/** 鏟子上現在有哪幾塊（在 clumps 裡的位置） */
export const scoopLoad = (s: ScoopState) => s.clumps.flatMap((c, i) => (c.at === "scoop" ? [i] : []));

/**
 * 每一格更新一次。x、z 是鏟子頭在砂盆裡的位置，down 是玩家有沒有按著，speed 是鏟子移動的速度，
 * vx 是左右方向的速度（右是正），overBag 是鏟子在垃圾袋上方。
 * 按著慢慢經過就連砂一起鏟起來（最多三塊）；左右來回甩，砂子從縫漏掉；動太快掉一塊回去；
 * 放開時在垃圾袋上方就丟進去（砂沒甩乾淨也丟得進去，但算浪費），不然全部掉回砂裡。
 */
export function scoopStep(s: ScoopState, box: LitterBoxKind, input: { x: number; z: number; down: boolean; speed: number; vx: number; overBag: boolean }): { state: ScoopState; event: ScoopEvent } {
  const { w, d } = LITTER_BOXES[box];
  const clumps = s.clumps.map((c) => ({ ...c }));
  const load = clumps.filter((c) => c.at === "scoop");
  const back = (c: Clump) => Object.assign(c, { at: "sand" as const, x: within(input.x, w / 2 - EDGE), z: within(input.z, d / 2 - EDGE) });
  let event: ScoopEvent = null, { bagged, sand, dir, wasted } = s;

  // 甩：左右方向換邊一次，漏掉一些砂（先算，這一格才鏟起來的不會馬上被甩）
  const turn = Math.abs(input.vx) > SHAKE_SPEED ? Math.sign(input.vx) : 0;
  if (turn && turn !== dir) {
    if (dir && load.length && sand > 0 && input.speed <= SCOOP_TOO_FAST) {
      sand = Math.max(0, sand - SHAKE_SIFTS);
      if (sand < SAND_CLEAN) sand = 0;
      event = sand === 0 ? "sifted" : "shake";
    }
    dir = turn;
  }
  // 動太快的時候鏟不起東西，不然剛掉下去的那一塊會馬上又被鏟起來
  if (input.down && !input.overBag && input.speed <= SCOOP_TOO_FAST) {
    for (const c of clumps) {
      if (load.length >= SCOOP_MAX) break;
      if (c.at === "sand" && Math.hypot(c.x - input.x, c.z - input.z) < c.r + REACH) { c.at = "scoop"; load.push(c); sand = 1; event = c.poop ? "pickPoop" : "pick"; }
    }
  }
  if (load.length && input.speed > SCOOP_TOO_FAST) { back(load.pop()!); event = "tooFast"; }
  if (!input.down && load.length) {
    if (input.overBag) {
      load.forEach((c) => { c.at = "bag"; });
      bagged += load.length;
      event = sand > 0 ? "baggedSandy" : "bagged";
      if (sand > 0) wasted += load.length;
    } else { load.forEach(back); event = "dropped"; }
    load.length = 0;
  }
  if (!load.length) sand = 0;
  return { state: { clumps, bagged, sand, dir, wasted }, event };
}

export const scoopDone = (s: ScoopState) => s.bagged >= s.clumps.length;
/** bagged／total／small 同 2D 版；sandy 是連砂一起丟掉的塊數。careGood("scoop") 要 bagged ≥ total 而且 total > 0 */
export const scoopResult = (s: ScoopState) => ({ bagged: s.bagged, total: s.clumps.length, small: false, sandy: s.wasted });

/**
 * 鏟屎的實際結果：每一坨都鏟起來丟進垃圾袋＝good；只丟了一部分＝partial（left 是還剩幾坨）；
 * 一坨都沒丟（含按「放下鏟子」、時間到、中途關掉回傳 null、砂盆本來就乾淨）＝none。
 */
export function scoopOutcome(r: unknown): { kind: "good" | "partial" | "none"; left: number | null } {
  const o = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
  const bagged = typeof o?.bagged === "number" ? o.bagged : 0;
  const total = typeof o?.total === "number" ? o.total : null;
  if (total === null) return { kind: "none", left: null };
  const left = Math.max(0, total - bagged);
  return { kind: total > 0 && left === 0 ? "good" : bagged > 0 ? "partial" : "none", left };
}

export const SCOOP_TEXT: Record<Exclude<ScoopEvent, null>, string> = {
  pick: "鏟起一塊結塊，上面都是砂，左右甩一甩。", pickPoop: "鏟起一條便便，上面都是砂，左右甩一甩。",
  shake: "砂子漏下去了，再甩幾下。", sifted: "砂甩乾淨了，拿去垃圾袋。",
  tooFast: "太用力了，掉回去了！", dropped: "放開了，東西掉回砂盆裡。",
  bagged: "丟進垃圾袋了。", baggedSandy: "丟進去了，可是帶了很多乾淨的砂，有點浪費。",
};
