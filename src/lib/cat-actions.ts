// 貓咪頁的 3D 貓：沒有動作按鈕，貓站在原地自己隨機換動作（純函式，畫面在 CatPreview 的 autoplay 模式）。
// 動作沿用 MeowHQ 動作庫（lib/hq/cat-models/clips.ts）：只挑母體 glb 真的有、動作庫標 ready 的動作。
// 母體補了新動作（例如理毛、休息）並改成 ready 後，加進 STAY 就會出現。走路、跳躍會移動位置，原地播放不自然，先不排。
import { CLIP_LIBRARY } from "./hq/cat-models/clips";

/** 原地做的動作與秒數範圍 */
const STAY: Record<string, [number, number]> = {
  idle: [3, 6], sit: [5, 9], sleep: [8, 14], eat: [5, 8], drink: [4, 6], toilet: [6, 8], groom: [5, 8], rest: [8, 16], belly_up: [6, 10], cuddle: [4, 7],
};
/** 程式版動作：母體 glb 沒有時 CatModel 用待機＋低頭做出來（PROCEDURAL_CLIPS） */
const PROCEDURAL = new Set(["eat", "drink"]);

export interface IdleStep { clip: string; seconds: number }

const ready = new Set(CLIP_LIBRARY.filter(c => c.status === "ready").map(c => c.code));
const between = (rand: () => number, [a, b]: [number, number]) => a + (b - a) * rand();

/** 這次可以排的動作：glb 有（吃、喝可以用程式版）、動作庫 ready */
export function idleClips(available: readonly string[]): string[] {
  const have = new Set(available);
  return Object.keys(STAY).filter(c => ready.has(c) && (have.has(c) || (PROCEDURAL.has(c) && have.has("idle"))));
}

/** 下一個動作：不連續做同一個（待機除外）；睡完一定先待機一下，不會一直睡 */
export function nextIdle(rand: () => number, available: readonly string[], last: IdleStep | null): IdleStep {
  const clips = idleClips(available);
  if (last?.clip === "sleep" && clips.includes("idle")) return { clip: "idle", seconds: between(rand, STAY.idle) };
  const pool = clips.filter(c => !(last?.clip === c && c !== "idle"));
  const clip = pool.length ? pool[Math.floor(rand() * pool.length) % pool.length] : "idle";
  return { clip, seconds: between(rand, STAY[clip] ?? STAY.idle) };
}
