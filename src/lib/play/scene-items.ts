// 虛擬飼養：把外出籠、餐碗、貓砂盆放進 3D 掃描房間（RoomViewer）。純函式，座標是地板座標（公尺）：x 沿 e1、z 沿 e2，和貓、物品箱子同一套。
// 玩家在「擺用品」選的是「某某旁」或「房間角落」，這裡換成房間裡真的能放的位置：在房間內、在能走的地板上、不壓到別的用品。
import type { RoomLayout, RoomObject, RoomScene } from "@/lib/hq/rooms/demo";

export interface SceneItem {
  id: string; url: string; widthM: number; depthM: number; heightM: number; near: string | null;
  /** 玩家在房間裡自己擺的位置（有就直接用，不再找「某某旁」） */
  at?: { x: number; z: number };
  /** 轉了幾個 90°（0～3） */
  rot?: number;
  /** 放在另一件用品旁（例如第 3 天砂盆搬到自由擺放的餐碗旁）；找不到那件就照 near */
  nearItem?: string;
}
export interface ScenePlacement { id: string; x: number; z: number }

const WALL_GAP_M = 0.12;  // 離牆
const GAP_M = 0.08;       // 離旁邊的物品、別的用品

/** 擺用品選的位置文字（「床旁」「房間角落」）→ 物品名稱；角落或沒選回 null */
export const nearLabel = (spot: string | null | undefined): string | null =>
  spot && spot.endsWith("旁") && spot.length > 1 ? spot.slice(0, -1) : null;

type Layout = Pick<RoomLayout, "cell" | "nx" | "ny" | "walkable" | "units_per_meter">;

const findObject = (scene: RoomScene, name: string | null): RoomObject | undefined =>
  name ? scene.objects.find(o => o.name_zh === name || o.label === name || o.id === name) : undefined;

/** 擋路的家具：貼著地板、有高度、不是整個房間那麼大的物件（地毯、牆、天花板不算）；用圓形（用品的外接圓）跟旋轉過的箱子比對 */
function blockers(scene: RoomScene): RoomObject[] {
  const [minX, minZ] = scene.room.min, [maxX, maxZ] = scene.room.max;
  const roomArea = (maxX - minX) * (maxZ - minZ);
  return scene.objects.filter(o => {
    const [, cy] = o.box.center, [sx, sy, sz] = o.box.size;
    return sy > 0.08 && cy - sy / 2 < 0.25 && sx * sz < roomArea * 0.6;
  });
}
/** 圓（x, z, r）有沒有壓到這個箱子（yaw 的正負號各試一次，寧可多避開一點） */
function hitsBox(o: RoomObject, x: number, z: number, r: number): boolean {
  const [cx, , cz] = o.box.center, [sx, , sz] = o.box.size;
  return [o.box.yaw, -o.box.yaw].some(yaw => {
    const dx = x - cx, dz = z - cz, c = Math.cos(yaw), s = Math.sin(yaw);
    const lx = Math.abs(dx * c + dz * s), lz = Math.abs(-dx * s + dz * c);
    return Math.hypot(Math.max(0, lx - sx / 2), Math.max(0, lz - sz / 2)) < r;
  });
}

export function placeScanItems(scene: RoomScene, layout: Layout, items: readonly SceneItem[]): ScenePlacement[] {
  const upm = layout.units_per_meter;
  const free = (x: number, z: number) => {
    const i = Math.floor((x * upm) / layout.cell), j = Math.floor((z * upm) / layout.cell);
    return i >= 0 && j >= 0 && i < layout.nx && j < layout.ny && layout.walkable[j * layout.nx + i] === "1";
  };
  const [minX, minZ] = scene.room.min, [maxX, maxZ] = scene.room.max;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const walls = blockers(scene);
  const taken: { x: number; z: number; r: number }[] = [];
  const out: ScenePlacement[] = [];

  // 玩家自己擺的先放（位置不動），其他的再避開它們找位置；回傳順序和 items 一樣
  const order = items.map((it, i) => i).sort((a, b) => Number(!items[a].at) - Number(!items[b].at));
  const byIndex: ScenePlacement[] = [];
  for (const idx of order) {
    const it = items[idx];
    const r = Math.max(it.widthM, it.depthM) / 2;
    if (it.at) {
      taken.push({ x: it.at.x, z: it.at.z, r });
      byIndex[idx] = { id: it.id, x: it.at.x, z: it.at.z };
      continue;
    }
    const inside = (x: number, z: number) => x > minX + WALL_GAP_M + r && x < maxX - WALL_GAP_M - r && z > minZ + WALL_GAP_M + r && z < maxZ - WALL_GAP_M - r;
    const ok = (x: number, z: number) =>
      inside(x, z)
      && [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]].every(([a, b]) => free(x + (a * it.widthM) / 2, z + (b * it.depthM) / 2))
      && walls.every(o => !hitsBox(o, x, z, r))
      && taken.every(t => Math.hypot(x - t.x, z - t.z) >= r + t.r + GAP_M);

    const mate = it.nearItem ? byIndex[items.findIndex(o => o.id === it.nearItem)] : undefined;
    const mateItem = mate ? items.find(o => o.id === it.nearItem)! : undefined;
    const target = mate && mateItem
      ? { box: { center: [mate.x, 0, mate.z], size: [mateItem.widthM, 0, mateItem.depthM] } }
      : findObject(scene, it.near);
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
    byIndex[idx] = { id: it.id, x, z };
  }
  out.push(...byIndex);
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
