// 虛擬飼養：把外出籠、餐碗、貓砂盆放進 3D 掃描房間（RoomViewer）。純函式，座標是地板座標（公尺）：x 沿 e1、z 沿 e2，和貓、物品箱子同一套。
// 玩家在「擺用品」選的是「某某旁」或「房間角落」，這裡換成房間裡真的能放的位置：在房間內、在能走的地板上、不壓到別的用品。
import type { RoomLayout, RoomObject, RoomScene } from "@/lib/hq/rooms/demo";

export interface SceneItem { id: string; url: string; widthM: number; depthM: number; heightM: number; near: string | null }
export interface ScenePlacement { id: string; x: number; z: number }

const WALL_GAP_M = 0.12;  // 離牆
const GAP_M = 0.08;       // 離旁邊的物品、別的用品

/** 擺用品選的位置文字（「床旁」「房間角落」）→ 物品名稱；角落或沒選回 null */
export const nearLabel = (spot: string | null | undefined): string | null =>
  spot && spot.endsWith("旁") && spot.length > 1 ? spot.slice(0, -1) : null;

type Layout = Pick<RoomLayout, "cell" | "nx" | "ny" | "walkable" | "units_per_meter">;

const findObject = (scene: RoomScene, name: string | null): RoomObject | undefined =>
  name ? scene.objects.find(o => o.name_zh === name || o.label === name || o.id === name) : undefined;

export function placeScanItems(scene: RoomScene, layout: Layout, items: readonly SceneItem[]): ScenePlacement[] {
  const upm = layout.units_per_meter;
  const free = (x: number, z: number) => {
    const i = Math.floor((x * upm) / layout.cell), j = Math.floor((z * upm) / layout.cell);
    return i >= 0 && j >= 0 && i < layout.nx && j < layout.ny && layout.walkable[j * layout.nx + i] === "1";
  };
  const [minX, minZ] = scene.room.min, [maxX, maxZ] = scene.room.max;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const taken: { x: number; z: number; r: number }[] = [];
  const out: ScenePlacement[] = [];

  for (const it of items) {
    const r = Math.max(it.widthM, it.depthM) / 2;
    const inside = (x: number, z: number) => x > minX + WALL_GAP_M + r && x < maxX - WALL_GAP_M - r && z > minZ + WALL_GAP_M + r && z < maxZ - WALL_GAP_M - r;
    const ok = (x: number, z: number) =>
      inside(x, z)
      && [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]].every(([a, b]) => free(x + (a * it.widthM) / 2, z + (b * it.depthM) / 2))
      && taken.every(t => Math.hypot(x - t.x, z - t.z) >= r + t.r + GAP_M);

    const target = findObject(scene, it.near);
    let spot: [number, number] | null = null;
    if (target) {
      const [ox, , oz] = target.box.center;
      const base = Math.max(target.box.size[0], target.box.size[2]) / 2 + r + GAP_M;
      const toCenter = Math.atan2(cz - oz, cx - ox);
      // 先試朝房間中央的那一側，再往兩邊轉；離物品由近到遠
      const angles = Array.from({ length: 24 }, (_, k) => k).map(k => toCenter + (Math.ceil(k / 2) * (k % 2 ? 1 : -1) * Math.PI * 2) / 24);
      search: for (const extra of [0, 0.15, 0.3, 0.5, 0.8]) {
        for (const a of angles) {
          const x = ox + Math.cos(a) * (base + extra), z = oz + Math.sin(a) * (base + extra);
          if (ok(x, z)) { spot = [x, z]; break search; }
        }
      }
    }
    if (!spot) {
      // 房間角落：能放的格點裡離四個角最近的
      const corners: [number, number][] = [[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]];
      let best = Infinity;
      for (let x = minX; x <= maxX; x += 0.1) {
        for (let z = minZ; z <= maxZ; z += 0.1) {
          if (!ok(x, z)) continue;
          const d = Math.min(...corners.map(([a, b]) => Math.hypot(x - a, z - b)));
          if (d < best) { best = d; spot = [x, z]; }
        }
      }
    }
    const [x, z] = spot ?? [cx, cz];  // 實在沒地方就放房間中央，至少看得到
    taken.push({ x, z, r });
    out.push({ id: it.id, x, z });
  }
  return out;
}

/** 一件用品佔的格子編號（j * nx + i），多留 4 公分邊距；貓的路徑要避開這些格子，不然會穿過用品 */
export function footprintCells(layout: Layout, it: { x: number; z: number; widthM: number; depthM: number }): number[] {
  const m = 0.04, upm = layout.units_per_meter, c = layout.cell;
  const at = (meters: number) => (meters * upm) / c;
  const out: number[] = [];
  for (let j = Math.floor(at(it.z - it.depthM / 2 - m)); j <= Math.floor(at(it.z + it.depthM / 2 + m)); j++)
    for (let i = Math.floor(at(it.x - it.widthM / 2 - m)); i <= Math.floor(at(it.x + it.widthM / 2 + m)); i++)
      if (i >= 0 && j >= 0 && i < layout.nx && j < layout.ny) out.push(j * layout.nx + i);
  return out;
}
