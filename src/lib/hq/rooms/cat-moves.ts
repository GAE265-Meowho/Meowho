// 貓的動作串接（掃描房間 RoomCat、示範娃娃屋 CatActor 共用）：走路配速、跳上跳下選哪個動作、起跳前轉身。純函式。
// 角度同 three.js rotation.y：0 面向 +z，heading＝atan2(dx, dz)。

/** 起跳前身體要轉到和跳躍方向差多少以內（弧度，約 12 度）才起跳 */
export const JUMP_READY_RAD = 0.2;
/** 高度差超過這個（公尺）才算往上／往下跳，不然算平跳 */
export const JUMP_LEVEL_M = 0.1;

/** 從 from 轉到 to 的最短角度差（-π～π） */
export const angleDiff = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** 往 target 轉，一次最多 maxTurn（弧度） */
export function turnStep(heading: number, target: number, maxTurn: number): number {
  const d = angleDiff(heading, target);
  return heading + Math.sign(d) * Math.min(Math.abs(d), Math.max(0, maxTurn));
}

/** 跳躍的水平方向；起落點幾乎重疊（原地往上跳）時沿用目前朝向 */
export function jumpHeading(from: { x: number; z: number }, to: { x: number; z: number }, current: number): number {
  const dx = to.x - from.x, dz = to.z - from.z;
  return Math.hypot(dx, dz) < 1e-3 ? current : Math.atan2(dx, dz);
}

/** 身體已經面向跳躍目標（差在 tol 以內）才可以起跳 */
export const jumpReady = (heading: number, target: number, tol = JUMP_READY_RAD) => Math.abs(angleDiff(heading, target)) <= tol;

export type JumpKind = "up" | "down" | "level";
export const jumpKind = (fromY: number, toY: number): JumpKind =>
  toY - fromY > JUMP_LEVEL_M ? "up" : fromY - toY > JUMP_LEVEL_M ? "down" : "level";

/**
 * 各種跳躍用哪個動作（clips.ts：jump_a 下往上跳、jump_b 往前跳、jump_c 從櫃子往下跳），母體沒有就退回下一個。
 * jump_start／jump_fall／jump_end 是影片轉 3D 專案舊貓模型的名字。
 */
const JUMP_CLIPS: Record<JumpKind, string[]> = {
  up: ["jump_a", "jump_b", "jump_start"],
  down: ["jump_c", "jump_b", "jump_fall"],
  level: ["jump_b", "jump_a", "jump_start"],
};
/** 挑跳躍動作；fallback＝用的不是這種跳躍的首選（回報缺動作用） */
export function jumpClipFor(kind: JumpKind, available: readonly string[]): { clip: string | null; fallback: boolean } {
  const list = JUMP_CLIPS[kind];
  const clip = list.find(n => available.includes(n)) ?? null;
  return { clip, fallback: clip !== list[0] };
}

export interface JumpTiming {
  /** 動作開始後幾秒離地（前面是蹲下蓄力） */
  takeoff: number;
  /** 幾秒落地（之後是落地緩衝） */
  land: number;
  duration: number;
}

/**
 * 從跳躍動作根骨頭的高度曲線找出離地、落地的時間：
 * 離地＝最高點之前最後一個還在起點高度（容許 5% 振幅）的時間；落地＝最高點之後第一個回到終點高度的時間。
 * 讀不到（沒有起伏）回 null。
 */
export function jumpTiming(times: readonly number[], ys: readonly number[]): JumpTiming | null {
  const n = Math.min(times.length, ys.length);
  if (n < 3) return null;
  let peak = 0;
  for (let i = 1; i < n; i++) if (ys[i] > ys[peak]) peak = i;
  const lo = Math.min(...ys.slice(0, n)), range = ys[peak] - lo;
  if (!(range > 1e-3) || peak === 0 || peak === n - 1) return null;
  const eps = range * 0.05, start = ys[0], end = ys[n - 1];
  let up = 0;
  for (let i = 0; i < peak; i++) if (ys[i] <= start + eps) up = i;
  let down = n - 1;
  for (let i = n - 1; i > peak; i--) if (ys[i] <= end + eps) down = i;
  return { takeoff: times[up], land: times[down], duration: times[n - 1] };
}

/** 移動時播什麼：跑得比 runAt 快且有跑步動作就跑，否則走路；速度為 0 不該叫這個 */
export function moveClip(speedMps: number, available: readonly string[], runAt = 0.8): "run" | "walk" {
  return speedMps > runAt && available.includes("run") ? "run" : "walk";
}

/** 動作播放速度：實際移動速度 ÷ 動作原本的步伐速度，避免滑步（限制在 0.3～3 倍） */
export const clipRate = (speedMps: number, clipMps: number) =>
  clipMps > 0 ? Math.min(3, Math.max(0.3, speedMps / clipMps)) : 1;
