// 虛擬飼養 DEMO（#237）：3D 娃娃屋裡「貓要走去哪」「用品可以放哪」。座標同 catwalk.ts（一間房左上角＝原點，公尺）。純函式。
// 劇情動作 → 目標：躲〈躲藏處〉＝走到那件家具旁的地板；跳〈高處〉、窩沙發＝點那件家具（catjump 會走過去跳上去）；
// 吃飯、上廁所＝走到擺好的餐碗、貓砂盆旁邊；探索＝房間裡固定的一個空位；睡覺、待著＝原地。
import { goalForBox, worldOf } from "@/lib/hq/floorplans/catjump";
import { blocked, CAT_RADIUS_M, obstacles, type Obstacle } from "@/lib/hq/floorplans/catwalk";
import type { RoomScene } from "@/lib/hq/floorplans/scene";

/** 3D 貓的動作（由劇本的場景姿勢、小遊戲換算） */
export type CatAction = "hide" | "carrier" | "explore" | "eat" | "litter" | "high" | "sofa" | "sleep" | "idle";

export interface Spot { x: number; z: number }
export interface PlacedSpot extends Spot { id: string; widthM: number; depthM: number }

/** 家具種類對應劇情通稱的關鍵字（furniture.ts 的 homeWord 回傳的字裡有這些字就用這件家具） */
const KIND_WORDS: Record<string, string[]> = {
  sofa: ["沙發"], bed: ["床"], wardrobe: ["衣櫃"], cabinet: ["櫃子"], tv_stand: ["電視櫃"], desk: ["書桌"], counter: ["流理台"], chair: ["椅"],
};

const floorFurniture = (s: RoomScene) =>
  s.boxes.map((b, i) => ({ b, i })).filter(({ b }) => b.kind === "furniture" && b.y - b.sy / 2 < 0.08);

/** 找出通稱（例如「沙發後」「櫃子」）對應的家具方塊索引 */
export function boxFor(s: RoomScene, place: string): number | null {
  const hit = floorFurniture(s).find(({ b }) => (KIND_WORDS[b.furniture ?? ""] ?? []).some(w => place.includes(w)));
  return hit ? hit.i : null;
}

/** 在 (x, z) 周圍由近到遠找一個貓站得下的地板位置 */
export function nearFree(s: RoomScene, obs: Obstacle[], x: number, z: number, r = CAT_RADIUS_M): Spot | null {
  for (let ring = 0.25; ring <= 1.6; ring += 0.15) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const px = x + Math.cos(a) * ring, pz = z + Math.sin(a) * ring;
      if (!blocked(px, pz, s, obs, r)) return { x: Math.round(px * 1000) / 1000, z: Math.round(pz * 1000) / 1000 };
    }
  }
  return null;
}

const itemObs = (items: PlacedSpot[]): Obstacle[] => items.map(i => ({ x: i.x, z: i.z, hx: i.widthM / 2, hz: i.depthM / 2, rotY: 0 }));

export interface CatGoal { box: number | null; x: number; z: number }

/** 劇情動作 → 貓的目標；null＝原地（睡覺、待著，或房間裡找不到對應的東西＝只用文字情境） */
export function goalFor(s: RoomScene, action: CatAction | undefined, places: { hide: string; high: string; sofa: string }, items: PlacedSpot[]): CatGoal | null {
  const obs = [...obstacles(s), ...itemObs(items)];
  const world = worldOf(s, obs);
  const jumpTo = (place: string): CatGoal | null => {
    const box = boxFor(s, place);
    if (box === null) return null;
    const b = s.boxes[box];
    return goalForBox(world, box, b.x, b.z) ? { box, x: b.x, z: b.z } : null;
  };
  switch (action) {
    case "hide": {
      const box = boxFor(s, places.hide);
      if (box === null) return null;
      const b = s.boxes[box];
      const spot = nearFree(s, obs, b.x, b.z, CAT_RADIUS_M);
      return spot && { box: null, ...spot };
    }
    case "high": return jumpTo(places.high);
    case "sofa": return jumpTo(places.sofa);
    case "eat":
    case "litter":
    case "carrier": {
      const item = items.find(i => i.id === (action === "eat" ? "bowl" : action === "litter" ? "litter_box" : "carrier"));
      if (!item) return null;
      const spot = nearFree(s, obs, item.x, item.z);
      return spot && { box: null, ...spot };
    }
    case "explore": {
      const spot = nearFree(s, obs, s.size[0] * 0.7, s.size[1] * 0.45);
      return spot && { box: null, ...spot };
    }
    default: return null;
  }
}

/** 用品可以放的位置：落地家具旁邊（點選位置用，手機不能拖放）；每個位置都站得下這件用品、不和已放的重疊 */
export function itemSpots(s: RoomScene, size: { widthM: number; depthM: number }, placed: PlacedSpot[], names: Record<number, string>): (Spot & { label: string })[] {
  const r = Math.max(size.widthM, size.depthM) / 2 + 0.05;
  const obs = [...obstacles(s), ...itemObs(placed)];
  const out: (Spot & { label: string })[] = [];
  for (const { b } of floorFurniture(s)) {
    const name = names[b.furnitureIndex ?? -1];
    if (!name) continue;
    const spot = nearFree(s, obs, b.x, b.z, r);
    if (spot && !out.some(o => Math.hypot(o.x - spot.x, o.z - spot.z) < 0.4)) out.push({ ...spot, label: `${name}旁` });
  }
  const corner = nearFree(s, obs, r + 0.1, s.size[1] - r - 0.1, r);
  if (corner) out.push({ ...corner, label: "房間角落" });
  return out;
}
