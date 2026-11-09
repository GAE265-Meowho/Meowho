// 貓咪頁的 3D 貓：使用者不操作，貓在空間白模裡自己走來走去、隨機做動作（純函式，畫面在 CatPreview 的 wander 模式）。
// 動作沿用 MeowHQ 動作庫（lib/hq/cat-models/clips.ts）：只挑母體 glb 真的有、動作庫標 ready 的動作。
// 母體補了新動作（例如理毛、休息）並改成 ready 後，加進 STAY 就會出現。跳躍要配合家具高度，白模裡沒有家具，先不排。
// 座標是成貓的公尺數（幼貓由畫面乘上縮放），貓面向 +Z；牆在 x = -1.2、z = -1.2（CatPreview 的 ROOM）。
import { CLIP_LIBRARY } from "./hq/cat-models/clips";

export interface Pt { x: number; z: number }

/** 白模裡的用品：餐碗、貓砂盆（成貓公尺） */
export const ROOM_ITEMS = {
  bowl: { x: 0.85, z: -0.85, r: 0.09 },
  litter: { x: -0.8, z: 0.75, w: 0.46, d: 0.36, h: 0.12 },
} as const;

/** 貓可以走的範圍（避開牆與用品） */
export const BOUNDS = { minX: -0.7, maxX: 1.0, minZ: -0.7, maxZ: 1.0 } as const;

/** 停在原地做的動作與秒數範圍 */
const STAY: Record<string, [number, number]> = { idle: [3, 6], sit: [5, 9], sleep: [10, 16], groom: [5, 8], rest: [6, 10], cuddle: [4, 7] };
/** 要走到用品旁邊才做的動作 */
const AT_ITEM: Record<string, { item: "bowl" | "litter"; seconds: [number, number] }> = {
  eat: { item: "bowl", seconds: [5, 8] }, drink: { item: "bowl", seconds: [4, 6] }, toilet: { item: "litter", seconds: [6, 8] },
};
/** 程式版動作：母體 glb 沒有時 CatModel 用待機＋低頭做出來（PROCEDURAL_CLIPS） */
const PROCEDURAL = new Set(["eat", "drink"]);

export interface Plan {
  /** 先走到這裡（null＝原地） */
  to: Pt | null;
  /** 到了之後面向哪裡（null＝維持走路方向） */
  face: Pt | null;
  clip: string;
  seconds: number;
}

const ready = new Set(CLIP_LIBRARY.filter(c => c.status === "ready").map(c => c.code));
const between = (rand: () => number, [a, b]: [number, number]) => a + (b - a) * rand();
const round = (n: number) => Math.round(n * 1000) / 1000;

/** 這次可以排的動作：glb 有（吃、喝可以用程式版）、動作庫 ready */
export function wanderClips(available: readonly string[]): string[] {
  const have = new Set(available);
  return [...Object.keys(STAY), ...Object.keys(AT_ITEM)].filter(c => ready.has(c) && (have.has(c) || (PROCEDURAL.has(c) && have.has("idle"))));
}

/** 用品旁邊貓要站的位置：從用品往房間中央退一段距離 */
export function standBy(item: "bowl" | "litter"): Pt {
  const it = ROOM_ITEMS[item];
  const gap = item === "bowl" ? 0.32 : 0.42;
  const len = Math.hypot(it.x, it.z) || 1;
  return { x: round(it.x - (it.x / len) * gap), z: round(it.z - (it.z / len) * gap) };
}

/** 隨機一個走得到的點，離現在的位置至少 0.4 公尺 */
export function randomSpot(rand: () => number, from: Pt): Pt {
  for (let i = 0; i < 12; i++) {
    const p = { x: round(BOUNDS.minX + (BOUNDS.maxX - BOUNDS.minX) * rand()), z: round(BOUNDS.minZ + (BOUNDS.maxZ - BOUNDS.minZ) * rand()) };
    if (Math.hypot(p.x - from.x, p.z - from.z) >= 0.4) return p;
  }
  return { x: round(from.x > 0.15 ? BOUNDS.minX + 0.2 : BOUNDS.maxX - 0.2), z: round(from.z) };
}

/**
 * 下一段行為：上一段是原地動作時，多半先走到別處（走路本身也是動作）；
 * 吃、喝、上廁所會先走到餐碗或貓砂盆旁邊並面向它。睡覺之後一定起來走走，不會一直睡。
 */
export function nextPlan(rand: () => number, available: readonly string[], at: Pt, last: Plan | null): Plan {
  const clips = wanderClips(available);
  const walk = available.includes("walk");
  if (walk && last && last.to === null && (last.clip === "sleep" || rand() < 0.55)) {
    return { to: randomSpot(rand, at), face: null, clip: "idle", seconds: between(rand, [1, 2]) };
  }
  const pool = clips.filter(c => !(last?.clip === c && c !== "idle"));
  const clip = pool.length ? pool[Math.floor(rand() * pool.length) % pool.length] : "idle";
  const need = AT_ITEM[clip];
  if (need && walk) {
    const it = ROOM_ITEMS[need.item];
    return { to: standBy(need.item), face: { x: it.x, z: it.z }, clip, seconds: between(rand, need.seconds) };
  }
  if (need) return { to: null, face: null, clip: "idle", seconds: between(rand, STAY.idle) };
  return { to: null, face: null, clip, seconds: between(rand, STAY[clip] ?? STAY.idle) };
}

/** 往目標走一格：回傳新位置、朝向（貓面向 +Z，heading＝繞 Y 軸角度）與是否到了 */
export function stepToward(at: Pt, to: Pt, speed: number, dt: number): { at: Pt; heading: number | null; arrived: boolean } {
  const dx = to.x - at.x, dz = to.z - at.z;
  const dist = Math.hypot(dx, dz);
  const move = speed * dt;
  if (dist <= Math.max(move, 0.01)) return { at: { ...to }, heading: dist > 1e-6 ? Math.atan2(dx, dz) : null, arrived: true };
  return { at: { x: at.x + (dx / dist) * move, z: at.z + (dz / dist) * move }, heading: Math.atan2(dx, dz), arrived: false };
}

/** 面向某一點的朝向 */
export const headingTo = (at: Pt, p: Pt) => Math.atan2(p.x - at.x, p.z - at.z);
