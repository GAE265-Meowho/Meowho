/** 3D 餵貓（虛擬飼養第 1 份）的規則：只算碗裡有多少、動作播到哪，不碰 3D。數值照 2D 版（catgame/minis.ts 的 startFeed）。 */

/** 罐頭兩種：主食罐（濕食，一坨一坨）、湯罐（液體） */
export type FeedCan = "wet" | "soup";
/** 一餐只餵一種：乾飼料、主食罐或湯罐，一開始先選 */
export type FeedKind = "dry" | FeedCan;

/** 乾飼料每秒倒進去的量；主食罐、湯罐一罐加多少（碗的容量算 100） */
const DRY_RATE = 22;
export const CAN_ADD: Record<FeedCan, number> = { wet: 30, soup: 10 };
const BOWL_MAX = 100;
/** 開一罐罐頭從拉拉環到倒完、換好下一罐共幾秒；播到這個比例時罐頭的內容落進碗裡 */
export const CAN_SECONDS = 3.4;
export const CAN_LANDS = 0.66;

export interface FeedState {
  /** 碗裡的乾飼料（顆粒） */
  dry: number;
  /** 主食罐、湯罐各倒了幾罐 */
  wet: number;
  soup: number;
  /** 碗滿了還在倒，灑到外面幾秒 */
  spill: number;
}
export const newFeed = (): FeedState => ({ dry: 0, wet: 0, soup: 0, spill: 0 });

/** 建議份量：結紮後少兩成、體型偏胖（7 以上）再少一成半 */
export const feedPortion = (ctx: { neutered?: boolean; cat: { body: number } }) =>
  Math.round(35 * (ctx.neutered ? 0.8 : 1) * (ctx.cat.body >= 7 ? 0.85 : 1));

/** 碗裡總共多少（乾飼料＋罐頭） */
export const feedAmount = (s: FeedState) => Math.min(BOWL_MAX, s.dry + s.wet * CAN_ADD.wet + s.soup * CAN_ADD.soup);

/** 飼料袋傾斜著倒：碗還沒滿就加顆粒，滿了就灑出去；dt 上限 0.1 秒，分頁切走再回來不會一次倒滿 */
export function pourDry(s: FeedState, dt: number): FeedState {
  if (!(dt > 0)) return s;
  const step = Math.min(dt, 0.1), room = BOWL_MAX - feedAmount(s);
  return room > 0 ? { ...s, dry: s.dry + Math.min(room, DRY_RATE * step) } : { ...s, spill: s.spill + step };
}

/** 還放得下一罐嗎（碗滿了就不能再開） */
export const canFits = (s: FeedState, can: FeedCan) => feedAmount(s) + CAN_ADD[can] <= BOWL_MAX;
/** 一罐罐頭倒進碗；可以再開第二罐，碗放不下就不算 */
export const addCan = (s: FeedState, can: FeedCan): FeedState => (canFits(s, can) ? { ...s, [can]: s[can] + 1 } : s);

/**
 * 結果格式照 careGood("feed")：碗裡總量 total ≥ 15、這次真的有倒（added > 0）、over 不是 true、spill < 1.5 才算餵好。
 * start＝進來時碗裡原本有的（同一天已經倒過，見 lib/play/care-day.ts）：added 只算這一次倒的，over 看碗裡總量；
 * bowl 是碗裡現在的樣子（只有數字），存回今日照顧狀態，下次進來碗還是這樣。
 */
export function feedResult(s: FeedState, portion: number, start: FeedState = newFeed()) {
  const total = Math.round(feedAmount(s)), added = total - Math.round(feedAmount(start));
  return { added, total, over: total > portion * 1.5, wet: s.wet > 0, soup: s.soup > 0, spill: Math.round(s.spill * 10) / 10,
    bowl: { dry: Math.round(s.dry * 10) / 10, wet: s.wet, soup: s.soup } };
}

/** already＝今天已經倒過飼料、這次還沒加：先提示碗裡還有 */
export function feedHint(s: FeedState, portion: number, pouring: boolean, already = false): string {
  const amount = feedAmount(s);
  if (already && !pouring && amount > 0) return amount >= portion * 0.8 ? "碗裡還有飼料，今天已經餵過了。" : "碗裡還有一點飼料，今天已經倒過一些了。";
  if (s.spill > 0.3) return "碗滿了，飼料灑到外面了。";
  if (amount > portion * 1.5) return "太多了，這樣會吃過量。";
  // 八成以上就算差不多：主食罐一罐是 30，建議份量 35 時不該還說不夠（再開一罐就過量了）
  if (amount >= portion * 0.8) return "差不多是建議份量了。";
  if (pouring) return "沙沙沙……";
  // 只餵湯罐：一罐的量不到算吃飽的 15
  if (s.soup > 0 && amount < 15) return "湯罐主要是補水分，一罐吃不飽，可以再開一罐。";
  return amount > 0 ? "還不夠，再加一點。" : "";
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number, a: number, b: number) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

export interface CanFrame {
  /** 左手拿著罐頭在碗上方的程度：平常是 1；倒完後退出畫面（0），換一罐新的再進來 */
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

/** 開一罐的動作，k 是 0～1 的進度。左手一開始就拿著罐頭在碗上方：右手拉開拉環 → 左手倒進碗 → 左手退出去、換一罐沒開過的回來 */
export function canFrame(k: number): CanFrame {
  return {
    canIn: 1 - ease(k, 0.84, 0.92) + ease(k, 0.92, 1),
    tabHand: ease(k, 0, 0.16) * (1 - ease(k, 0.32, 0.42)),
    lid: k < 0.92 ? ease(k, 0.18, 0.3) : 0,
    tilt: ease(k, 0.42, 0.56) * (1 - ease(k, 0.72, 0.8)),
    drop: clamp01((k - 0.54) / (CAN_LANDS - 0.54)),
  };
}
