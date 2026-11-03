// 虛擬體驗（#150）：貓在 3D 室內空間裡走路。純函式，畫面（FloorplanViewer）每格呼叫 stepCat。
// 座標同 scene.ts：一間房的左上角＝原點，x 向右、z 向下（平面 y），公尺。
// 地板上：牆、窗台、家具都是障礙；門楣在頭上，不擋路。跳上家具在 catjump.ts。
import { colliders, type RoomScene, type SceneBox } from "./scene";

/**
 * 虛擬體驗裡貓放大的倍數（Tina 2026-11-03：真實比例在整間房的鏡頭裡看起來太小；成貓母體約長 0.58、高 0.51 m）
 */
export const CAT_SCALE = 1.2;
/** 貓的碰撞半徑（放大後的半個身寬加一點餘裕） */
export const CAT_RADIUS_M = 0.2;
/** 走路速度（公尺／秒） */
export const CAT_SPEED = 0.55;
/** 轉身速度（弧度／秒） */
const TURN_SPEED = 5;
/** 離目標多近算到達 */
const ARRIVE_M = 0.06;
/** 方塊底部高於這個高度就不擋路（門楣） */
const PASS_UNDER_M = 0.3;

/** 地上的障礙：平面上的旋轉矩形（中心、半寬、半深、轉角） */
export interface Obstacle { x: number; z: number; hx: number; hz: number; rotY: number }

export const obstacles = (scene: RoomScene): Obstacle[] =>
  colliders(scene)
    .filter((b: SceneBox) => b.y - b.sy / 2 < PASS_UNDER_M)
    .map(b => ({ x: b.x, z: b.z, hx: b.sx / 2, hz: b.sz / 2, rotY: b.rotY }));

/** 點 (x, z) 加上半徑 r 會不會撞到障礙，或走出房間 */
export function blocked(x: number, z: number, scene: RoomScene, obs: Obstacle[], r = CAT_RADIUS_M): boolean {
  if (x < r || z < r || x > scene.size[0] - r || z > scene.size[1] - r) return true;
  return obs.some(o => {
    // 轉到方塊自己的座標（three.js 繞 Y 轉 rotY 的反向）
    const dx = x - o.x, dz = z - o.z;
    const c = Math.cos(o.rotY), s = Math.sin(o.rotY);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < o.hx + r && Math.abs(lz) < o.hz + r;
  });
}

export interface CatState { x: number; z: number; heading: number; moving: boolean }

/** 從 (0,0,1) 轉到 (dx, dz) 的角度：模型正面朝 +Z */
export const headingTo = (dx: number, dz: number) => Math.atan2(dx, dz);

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * 往目標走一小步：先轉向、再前進；前方被擋住時沿著障礙滑過去，滑不動才停下（不穿牆）。
 * 回傳新的狀態；到達或被擋住時 moving＝false。isBlocked 決定哪裡不能站（地板：牆與家具；家具上：走出檯面）。
 */
export function stepToward(cat: CatState, target: { x: number; z: number } | null, isBlocked: (x: number, z: number) => boolean, dt: number): CatState {
  if (!target) return { ...cat, moving: false };
  const dx = target.x - cat.x, dz = target.z - cat.z;
  const d = Math.hypot(dx, dz);
  if (d < ARRIVE_M) return { ...cat, moving: false };
  const want = headingTo(dx, dz);
  const diff = wrap(want - cat.heading);
  const turn = Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * dt);
  const heading = wrap(cat.heading + turn);
  // 方向差太多時原地轉身，不要斜著橫移
  if (Math.abs(diff) > Math.PI / 3) return { ...cat, heading, moving: true };
  const step = Math.min(d, CAT_SPEED * dt);
  const nx = cat.x + Math.sin(heading) * step, nz = cat.z + Math.cos(heading) * step;
  if (!isBlocked(nx, nz)) return { x: nx, z: nz, heading, moving: true };
  // 前方被擋住：沿著障礙滑過去（只走 x 或只走 z），能更接近目標才走；都不行就停下
  for (const [sx, sz] of [[nx, cat.z], [cat.x, nz]] as const) {
    const closer = Math.hypot(target.x - sx, target.z - sz) < d - 1e-4;
    if (closer && !isBlocked(sx, sz)) return { x: sx, z: sz, heading, moving: true };
  }
  return { ...cat, heading, moving: false };
}

/** 在地板上走一小步（牆與家具擋路） */
export const stepCat = (cat: CatState, target: { x: number; z: number } | null, scene: RoomScene, obs: Obstacle[], dt: number) =>
  stepToward(cat, target, (x, z) => blocked(x, z, scene, obs), dt);

/** 貓的起點：離房間中心最近、可以站的位置（每 10 公分找一次，結果固定，每次打開都在同一個地方）；整間都站不下回 null */
export function freeSpot(scene: RoomScene, obs: Obstacle[]): { x: number; z: number } | null {
  const [w, d] = scene.size;
  const cx = w / 2, cz = d / 2;
  let best: { x: number; z: number; dist: number } | null = null;
  for (let x = CAT_RADIUS_M; x <= w - CAT_RADIUS_M + 1e-9; x += 0.1) {
    for (let z = CAT_RADIUS_M; z <= d - CAT_RADIUS_M + 1e-9; z += 0.1) {
      const dist = Math.hypot(x - cx, z - cz);
      if ((!best || dist < best.dist - 1e-9) && !blocked(x, z, scene, obs)) best = { x, z, dist };
    }
  }
  if (!blocked(cx, cz, scene, obs)) return { x: cx, z: cz };
  return best && { x: Math.round(best.x * 1000) / 1000, z: Math.round(best.z * 1000) / 1000 };
}

/** 閒置時隨機逛：房間內隨機找一個可站的位置（不先試中心）；找不到回 null */
export function wanderSpot(scene: RoomScene, obs: Obstacle[], rand: () => number = Math.random, tries = 30): { x: number; z: number } | null {
  const [w, d] = scene.size;
  for (let i = 0; i < tries; i++) {
    const x = CAT_RADIUS_M + rand() * (w - 2 * CAT_RADIUS_M), z = CAT_RADIUS_M + rand() * (d - 2 * CAT_RADIUS_M);
    if (!blocked(x, z, scene, obs)) return { x, z };
  }
  return null;
}
