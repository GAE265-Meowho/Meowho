/** 換水時洗碗、沖碗（虛擬飼養第 1 份）：倒掉舊水 → 菜瓜布搓碗 → 開水沖掉泡泡 → 倒掉沖碗的水 → 接新水。只算數值，不碰 3D。 */

/** 菜瓜布在碗裡搓過多長的距離算洗乾淨（公尺；在碗底畫 3 公分半徑的圈約 3 圈），畫圈、來回搓都算 */
export const SCRUB_DISTANCE = 0.6;
/** 菜瓜布離碗中心多遠以內才算在碗裡搓（公尺）；一格移動超過這個距離當成跳過去，不算 */
const SCRUB_R = 0.06, MAX_JUMP = 0.03;
/** 開著水多久沖得掉泡泡（秒）；沖碗的水最多裝到幾成、每秒漲多少 */
export const RINSE_SECONDS = 1.2;
export const RINSE_WATER = 0.3;
const RINSE_RATE = 0.45;
/** 倒掉沖碗的水要幾秒 */
export const DUMP_SECONDS = 2;

export interface ScrubState {
  /** 累計搓過的距離（公尺），只會增加 */
  moved: number;
  /** 上一次菜瓜布的位置；離開碗或剛開始是 null */
  last: [number, number] | null;
}
export const newScrub = (): ScrubState => ({ moved: 0, last: null });

/** x、z 是菜瓜布相對碗中心的位置（公尺）；down 是玩家有沒有按著 */
export function scrubStep(s: ScrubState, x: number, z: number, down: boolean): ScrubState {
  if (!down || Math.hypot(x, z) > SCRUB_R) return { ...s, last: null };
  if (!s.last) return { ...s, last: [x, z] };
  const d = Math.hypot(x - s.last[0], z - s.last[1]);
  return { moved: d > MAX_JUMP ? s.moved : s.moved + d, last: [x, z] };
}

/** 洗乾淨的程度 0～1 */
export const scrubClean = (s: ScrubState) => Math.min(1, s.moved / SCRUB_DISTANCE);

/** 沖碗：水開著（open > 0.5）泡泡慢慢沖掉、碗裡積一點水 */
export function rinseStep(s: { foam: number; water: number }, open: number, dt: number) {
  if (open <= 0.5 || !(dt > 0)) return s;
  const step = Math.min(dt, 0.1);
  return { foam: Math.max(0, s.foam - step / RINSE_SECONDS), water: Math.min(RINSE_WATER, s.water + RINSE_RATE * step) };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number, a: number, b: number) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

/** 倒掉沖碗的水，k 是 0～1 的進度：碗傾斜 → 水流光 → 扶正。water 是剩下的比例（乘上原本的水位） */
export function dumpFrame(k: number) {
  const tilt = ease(k, 0, 0.3) * (1 - ease(k, 0.75, 1)), water = 1 - ease(k, 0.25, 0.7);
  return { tilt, water, pouring: tilt > 0.6 && water > 0.01 };
}
