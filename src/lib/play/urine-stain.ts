// 虛擬飼養：3D 尿漬（#354，節點 month8、物件 urine_stain）。純函式：什麼時候出現、幾灘、放在哪、形狀。
// 半年後幼貓未結紮、不是母貓（公貓或不知道）：「半夜亂噴尿」那一幕（姿勢 zoom，和噴尿音效同時）牆角出現淡黃的尿漬；
// 一換到診間或之後的劇情就消失。尿漬是房間地板上的扁平貼片，不是模型：淡黃、半透明、邊緣不規則，不寫實。
import { blocked, obstacles } from "@/lib/hq/floorplans/catwalk";
import type { RoomScene as HouseScene } from "@/lib/hq/floorplans/scene";
import type { RoomLayout, RoomScene } from "@/lib/hq/rooms/demo";
import { placeScanItems } from "./scene-items";
import { needsSpay, type CatPose, type Life } from "./story";

export interface Stain {
  id: string;
  /** 掃描房間：優先放在這些物件旁（找不到就放牆角）；null＝牆角 */
  near: readonly string[] | null;
  /** 大約的半徑（公尺） */
  r: number;
}
export interface StainSpot { id: string; x: number; z: number; r: number }

/** 顏色：淡黃（對應 --yellow-soft 偏深一點，3D 材質要實際色值）、透明度 */
export const STAIN = { color: 0xe9c75a, core: 0xd9ac3c, opacity: 0.6 } as const;

const STAINS: readonly Stain[] = [
  { id: "stain-box", near: ["紙箱", "箱子", "box"], r: 0.17 },
  { id: "stain-corner", near: null, r: 0.22 },
  { id: "stain-furniture", near: ["沙發", "床", "櫃", "sofa", "bed"], r: 0.15 },
];

const NONE: readonly Stain[] = [];

/** 現在要不要顯示尿漬、顯示哪幾灘（空陣列＝不顯示） */
export function stainsFor({ step, nodeId, bg, pose, life }: { step: string; nodeId: string | null; bg: string; pose: CatPose; life: Life }): readonly Stain[] {
  if (step !== "node" || nodeId !== "month8" || bg !== "room" || pose !== "zoom") return NONE;
  if (life.cat.sex === "female" || !needsSpay(life)) return NONE;
  return STAINS;
}

const hasObject = (scene: RoomScene, names: readonly string[] | null) =>
  names?.find(n => scene.objects.some(o => o.name_zh === n || o.label === n || o.id === n || (o.name_zh ?? "").includes(n))) ?? null;

/** 掃描房間：沿用用品的擺位規則（在房間內、走得到的地板、不壓到家具、彼此分開）；座標是地板座標（公尺） */
export function scanStainSpots(scene: RoomScene, layout: Pick<RoomLayout, "cell" | "nx" | "ny" | "walkable" | "units_per_meter">, stains: readonly Stain[]): StainSpot[] {
  const items = stains.map(s => ({ id: s.id, url: "", widthM: s.r * 2, depthM: s.r * 2, heightM: 0, near: hasObject(scene, s.near) }));
  const spots = placeScanItems(scene, layout, items);
  return spots.map((p, i) => ({ id: p.id, x: p.x, z: p.z, r: stains[i].r }));
}

/** 娃娃屋：房間四個角、四面牆中間（離牆 0.3 公尺）、貼地家具旁，不壓到家具的前 N 個（離貓近的先）；座標＝房間座標（左上角原點，公尺） */
export function houseStainSpots(scene: HouseScene, stains: readonly Stain[]): StainSpot[] {
  const [w, d] = scene.size, m = 0.3, obs = obstacles(scene);
  // 先放離貓（半夜在房間裡跑的位置，stage.ts 的 explore）近的，鏡頭跟著貓時才看得到
  const cat = [w * 0.7, d * 0.45];
  const beside = scene.boxes.filter(b => b.kind === "furniture" && b.y - b.sy / 2 < 0.08 && b.sy > 0.2)
    .flatMap(b => [[b.x + b.sx / 2 + 0.25, b.z], [b.x - b.sx / 2 - 0.25, b.z], [b.x, b.z + b.sz / 2 + 0.25]] as [number, number][]);  // 只取朝鏡頭（+z）和左右兩側，不被家具擋住
  const candidates = ([[w - m, m], [m, d - m], [w - m, d - m], [m, m], [w / 2, d - m], [w - m, d / 2], [w / 2, m], [m, d / 2], ...beside])
    .sort((a, b) => Math.hypot(a[0] - cat[0], a[1] - cat[1]) - Math.hypot(b[0] - cat[0], b[1] - cat[1]));
  const out: StainSpot[] = [];
  for (const s of stains) {
    const hit = candidates.find(([x, z]) => !blocked(x, z, scene, obs, s.r) && out.every(o => Math.hypot(x - o.x, z - o.z) > o.r + s.r + 0.2));
    if (hit) out.push({ id: s.id, x: hit[0], z: hit[1], r: s.r });
  }
  return out;
}

/** 不規則的圓形輪廓（點在 x–y 平面、相對中心，公尺）：同一個 id 每次一樣；半徑在 0.7～1.15 倍之間 */
export function blobOutline(id: string, r: number, n = 14): [number, number][] {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2, f = 0.7 + rnd() * 0.45;
    return [Math.cos(a) * r * f, Math.sin(a) * r * f];
  });
}
