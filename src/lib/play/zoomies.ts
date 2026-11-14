// 虛擬飼養第 30 天「半夜跑酷」與 3D 逗貓上家具（掃描房間）。純函式，單位公尺，座標是房間地板座標（x、z）。
// 跑酷：貓用跑步動作在房間裡衝來衝去，時不時跳上家具、待一下又跳下來；移動方向就是頭的方向（RoomCat 沿 heading 前進）。
// 逗貓：玩具可以拖到家具（床等）的檯面上，貓跟著跳上去追；玩具回到地板，貓就跳下來。

/**
 * 有檯面的家具：檯面中心 x、z，長寬 w（沿 yaw 轉過的 x）、d，檯面高度 top，水平轉角 yaw（弧度）。
 * yaw 的方向同房間（demo.ts roomViews）：地板座標＝(u·cos − v·sin, u·sin + v·cos)。掃描的床常常斜放（例如 0.7 弧度）。
 */
export interface Top { id: string; x: number; z: number; w: number; d: number; top: number; yaw?: number }

/** 地板座標 → 檯面自己的座標（u 沿寬、v 沿長，原點在檯面中心） */
export function toTop(t: Top, x: number, z: number): [number, number] {
  const c = Math.cos(t.yaw ?? 0), s = Math.sin(t.yaw ?? 0), dx = x - t.x, dz = z - t.z;
  return [dx * c + dz * s, -dx * s + dz * c];
}

/** 檯面上隨機一點（扣掉邊緣），地板座標；跑酷跳上家具時當落點 */
export function topSpot(t: Top, rand: () => number = Math.random, edge = 0.15): [number, number] {
  const u = (rand() - 0.5) * Math.max(0, t.w - 2 * edge), v = (rand() - 0.5) * Math.max(0, t.d - 2 * edge);
  const c = Math.cos(t.yaw ?? 0), s = Math.sin(t.yaw ?? 0);
  return [t.x + u * c - v * s, t.z + u * s + v * c];
}

/** 檯面邊緣內縮多少才算玩具「在檯面上」（太靠邊貓站不上去） */
export const TOP_EDGE_M = 0.05;

/** (x, z) 落在哪個檯面上（重疊時取最高的）；都不在回 null */
export function topUnder(x: number, z: number, tops: readonly Top[], edge = TOP_EDGE_M): Top | null {
  let best: Top | null = null;
  for (const t of tops) {
    const [u, v] = toTop(t, x, z);
    const inX = Math.abs(u) <= t.w / 2 - edge, inZ = Math.abs(v) <= t.d / 2 - edge;
    if (inX && inZ && (!best || t.top > best.top)) best = t;
  }
  return best;
}

/**
 * 從鏡頭射出的線（地板座標，公尺）先打到哪裡：家具檯面或地板。
 * 回傳打到的點和檯面（地板＝null）；往上看、打不到任何東西回 null。
 */
export function rayHit(origin: readonly [number, number, number], dir: readonly [number, number, number], tops: readonly Top[]):
  { x: number; y: number; z: number; on: Top | null } | null {
  if (!(dir[1] < -1e-6)) return null;  // 要往下看才打得到檯面或地板
  let hit: { x: number; y: number; z: number; on: Top | null; t: number } | null = null;
  const at = (y: number) => {
    const t = (y - origin[1]) / dir[1];
    return t > 0 ? { t, x: origin[0] + dir[0] * t, z: origin[2] + dir[2] * t } : null;
  };
  for (const top of tops) {
    const p = at(top.top);
    if (p && topUnder(p.x, p.z, [top]) && (!hit || p.t < hit.t)) hit = { x: p.x, y: top.top, z: p.z, on: top, t: p.t };
  }
  const floor = at(0);
  if (floor && (!hit || floor.t < hit.t)) hit = { x: floor.x, y: 0, z: floor.z, on: null, t: floor.t };
  return hit && { x: hit.x, y: hit.y, z: hit.z, on: hit.on };
}

/** 跑酷時下一步做什麼：在地板上多半衝到別處、偶爾跳上家具；在家具上待一下就跳下來 */
export type ZoomStep = { kind: "run" } | { kind: "jump"; top: Top } | { kind: "down" };

/** 跳上家具的機率（每次挑下一步時） */
export const ZOOM_JUMP_P = 0.35;

/** rand：0～1 的亂數（測試可以固定） */
export function nextZoom(onTop: boolean, tops: readonly Top[], rand: () => number = Math.random): ZoomStep {
  if (onTop) return { kind: "down" };
  if (tops.length && rand() < ZOOM_JUMP_P) return { kind: "jump", top: tops[Math.min(tops.length - 1, Math.floor(rand() * tops.length))] };
  return { kind: "run" };
}

/** 跑酷時閒晃要跑多遠（公尺）：比平常走路（0.6～3）遠，看起來像在衝刺 */
export const ZOOM_RUN_M: readonly [number, number] = [1.2, 4];
/** 跑酷時每段之間停多久（秒）：在地板上幾乎不停，在家具上待一下 */
export const zoomRest = (onTop: boolean, rand: () => number = Math.random) => (onTop ? 0.6 + rand() * 0.8 : 0.15 + rand() * 0.25);
