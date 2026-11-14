// 虛擬飼養「擺用品」（#354）：在 3D 掃描房間自由擺放用品。純函式，地板座標（公尺）：x 沿 e1、y 向上、z 沿 e2（同 scene-items、overview）。
// 點地板＝射線和地板（y＝0）的交點；擺的位置一律夾在房間內、離牆一點，不能和別的用品重疊（用平面包圍盒判斷）。
import type { RoomScene, Vec3 } from "@/lib/hq/rooms/demo";

/** 擺用品的可調常數（實機調整只改這裡） */
export const PLACE_EDIT = {
  /** 移動鈕一步幾公尺 */
  stepM: 0.1,
  /** 用品離牆至少幾公尺 */
  wallM: 0.12,
  /** 兩件用品之間至少留幾公尺 */
  gapM: 0.02,
  /** 按住移動鈕多久後開始連續移動（毫秒） */
  repeatDelayMs: 320,
  /** 連續移動時每一步間隔（毫秒） */
  repeatMs: 90,
} as const;

/** 玩家自己擺的位置：x、z（公尺）；rot＝轉了幾個 90°（0～3） */
export interface ItemPose { x: number; z: number; rot?: number }
export type MoveDir = "up" | "down" | "left" | "right";
/** 平面包圍盒：中心與沿 x、z 的全寬 */
export interface Footprint { x: number; z: number; w: number; d: number }

/** 轉 90°／270° 時寬深對調 */
export function footprintSize(widthM: number, depthM: number, rot = 0): [number, number] {
  return ((rot % 2) + 2) % 2 ? [depthM, widthM] : [widthM, depthM];
}

/** 射線（地板座標的起點與方向）和地板 y＝0 的交點；平行或往上看回 null */
export function floorHit(origin: Vec3, dir: Vec3): [number, number] | null {
  if (!(dir[1] < -1e-6) || !(origin[1] > 0)) return null;
  const t = -origin[1] / dir[1];
  return [origin[0] + dir[0] * t, origin[2] + dir[2] * t];
}

/** 把 w×d 的用品中心夾進房間（room.min/max 是沿牆座標，yaw 轉過），離牆 wallM；房間太窄就放中間 */
export function clampToRoom(room: RoomScene["room"], x: number, z: number, w: number, d: number): [number, number] {
  const c = Math.cos(room.yaw ?? 0), s = Math.sin(room.yaw ?? 0);
  const hu = Math.abs((w / 2) * c) + Math.abs((d / 2) * s) + PLACE_EDIT.wallM;
  const hv = Math.abs((w / 2) * s) + Math.abs((d / 2) * c) + PLACE_EDIT.wallM;
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));
  const u = clamp(x * c + z * s, room.min[0] + hu, room.max[0] - hu);
  const v = clamp(-x * s + z * c, room.min[1] + hv, room.max[1] - hv);
  return [u * c - v * s, u * s + v * c];
}

/** 兩個平面包圍盒有沒有重疊（中間至少留 gapM） */
export function overlaps(a: Footprint, b: Footprint, gap: number = PLACE_EDIT.gapM): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + gap;
}

/**
 * 試著把用品放在 (x, z)：先夾進房間，再檢查會不會壓到別的用品。
 * 回傳最後的位置；壓到時回傳 { blockedBy: 那件的 id }，畫面提示「會和○○重疊」。
 */
export function tryPlace(
  room: RoomScene["room"], item: { w: number; d: number }, x: number, z: number, others: readonly (Footprint & { id: string })[],
): { x: number; z: number } | { blockedBy: string } {
  const [cx, cz] = clampToRoom(room, x, z, item.w, item.d);
  const hit = others.find(o => overlaps({ x: cx, z: cz, w: item.w, d: item.d }, o));
  return hit ? { blockedBy: hit.id } : { x: cx, z: cz };
}

/**
 * 畫面上的方向 → 地板上移一步（公尺）。camDir＝鏡頭視線（地板座標），handed 同 overview（地板座標的左右手）。
 * 畫面「上」＝離鏡頭遠一點、「右」＝畫面右邊；最後對齊到最接近的牆的方向，用品才會沿著牆走直線。
 */
export function screenStep(dir: MoveDir, camDir: Vec3, handed: number, roomYaw = 0, step: number = PLACE_EDIT.stepM): [number, number] {
  const fl = Math.hypot(camDir[0], camDir[2]);
  const f: [number, number] = fl > 1e-9 ? [camDir[0] / fl, camDir[2] / fl] : [0, 1];
  const right: [number, number] = [-handed * f[1], handed * f[0]];
  const want = { up: f, down: [-f[0], -f[1]], right, left: [-right[0], -right[1]] }[dir] as [number, number];
  const c = Math.cos(roomYaw), s = Math.sin(roomYaw);
  const axes: [number, number][] = [[c, s], [-c, -s], [-s, c], [s, -c]];
  const best = axes.reduce((a, b) => (b[0] * want[0] + b[1] * want[1] > a[0] * want[0] + a[1] * want[1] ? b : a));
  return [best[0] * step, best[1] * step];
}

/** 存檔讀回的擺放：只留數字正確的欄位（舊存檔沒有這欄就是空的） */
export function parsePoses(raw: unknown): Record<string, ItemPose> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, ItemPose> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const p = v as Partial<ItemPose> | null;
    if (!p || typeof p !== "object" || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    out[k] = { x: p.x as number, z: p.z as number, ...(Number.isInteger(p.rot) ? { rot: (((p.rot as number) % 4) + 4) % 4 } : {}) };
  }
  return out;
}
