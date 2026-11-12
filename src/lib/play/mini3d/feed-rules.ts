/** 3D 餵貓（虛擬飼養第 1 份）的規則：只算碗裡有多少、動作播到哪，不碰 3D。數值照 2D 版（catgame/minis.ts 的 startFeed）。 */

/** 罐頭兩種：主食罐（濕食，一坨一坨）、湯罐（液體） */
export type FeedCan = "wet" | "soup";

/** 乾飼料每秒倒進去的量；主食罐、湯罐一罐加多少（碗的容量算 100） */
const DRY_RATE = 22;
export const CAN_ADD: Record<FeedCan, number> = { wet: 30, soup: 10 };
const BOWL_MAX = 100;
/** 開一罐罐頭從拿進來到倒完共幾秒；播到這個比例時罐頭的內容落進碗裡 */
export const CAN_SECONDS = 3.4;
export const CAN_LANDS = 0.76;

export interface FeedState {
  /** 碗裡的乾飼料（顆粒） */
  dry: number;
  /** 主食罐、湯罐加過了沒（各只能加一次） */
  wet: boolean;
  soup: boolean;
  /** 碗滿了還在倒，灑到外面幾秒 */
  spill: number;
}
export const newFeed = (): FeedState => ({ dry: 0, wet: false, soup: false, spill: 0 });

/** 建議份量：結紮後少兩成、體型偏胖（7 以上）再少一成半 */
export const feedPortion = (ctx: { neutered?: boolean; cat: { body: number } }) =>
  Math.round(35 * (ctx.neutered ? 0.8 : 1) * (ctx.cat.body >= 7 ? 0.85 : 1));

/** 碗裡總共多少（乾飼料＋罐頭） */
export const feedAmount = (s: FeedState) => Math.min(BOWL_MAX, s.dry + (s.wet ? CAN_ADD.wet : 0) + (s.soup ? CAN_ADD.soup : 0));

/** 飼料袋傾斜著倒：碗還沒滿就加顆粒，滿了就灑出去；dt 上限 0.1 秒，分頁切走再回來不會一次倒滿 */
export function pourDry(s: FeedState, dt: number): FeedState {
  if (!(dt > 0)) return s;
  const step = Math.min(dt, 0.1), room = BOWL_MAX - feedAmount(s);
  return room > 0 ? { ...s, dry: s.dry + Math.min(room, DRY_RATE * step) } : { ...s, spill: s.spill + step };
}

/** 罐頭倒進碗：每種只算一次 */
export const addCan = (s: FeedState, can: FeedCan): FeedState => (s[can] ? s : { ...s, [can]: true });

/** 結果格式照 careGood("feed")：added ≥ 15、over 不是 true、spill < 1.5 才算餵好 */
export function feedResult(s: FeedState, portion: number) {
  const added = Math.round(feedAmount(s));
  return { added, over: added > portion * 1.5, wet: s.wet, soup: s.soup, spill: Math.round(s.spill * 10) / 10 };
}

export function feedHint(s: FeedState, portion: number, pouring: boolean): string {
  const amount = feedAmount(s);
  if (s.spill > 0.3) return "碗滿了，飼料灑到外面了。";
  if (amount > portion * 1.5) return "太多了，這樣會吃過量。";
  if (amount >= portion * 0.9) return "差不多是建議份量了。";
  if (pouring) return "沙沙沙……";
  return amount > 0 ? "還不夠，再加一點。" : "";
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number, a: number, b: number) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

export interface CanFrame {
  /** 右手拿著飼料袋在碗旁邊的程度：開罐頭時先退出畫面（0），結束再回來（1） */
  bagHand: number;
  /** 左手拿著罐頭進到碗上方的程度 */
  canIn: number;
  /** 右手（空手）伸到拉環上的程度 */
  tabHand: number;
  /** 蓋子拉開的程度 */
  lid: number;
  /** 罐頭往碗傾倒的程度 */
  tilt: number;
  /** 內容從罐口落到碗裡的進度；0 還沒倒、1 落到碗裡 */
  drop: number;
}

/** 開罐頭的動作，k 是 0～1 的進度：右手放下飼料袋 → 左手拿罐頭進來 → 右手拉開拉環 → 左手倒進碗 → 兩手回到原位 */
export function canFrame(k: number): CanFrame {
  return {
    bagHand: 1 - ease(k, 0, 0.12) + ease(k, 0.88, 1),
    canIn: ease(k, 0.03, 0.18) * (1 - ease(k, 0.86, 1)),
    tabHand: ease(k, 0.16, 0.3) * (1 - ease(k, 0.46, 0.56)),
    lid: ease(k, 0.32, 0.44),
    tilt: ease(k, 0.56, 0.68) * (1 - ease(k, 0.8, 0.88)),
    drop: clamp01((k - 0.66) / (CAN_LANDS - 0.66)),
  };
}
