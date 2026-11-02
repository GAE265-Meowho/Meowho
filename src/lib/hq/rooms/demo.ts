// 展示房間（#93）：manifest 由影片轉 3D 流程產生，檔案放在 Supabase 的 meow-room-models。
// 網址由 NEXT_PUBLIC_ROOM_DEMO_BASE 提供，不寫進程式：repo 是公開的，房間路徑不進 GitHub。
export type Vec3 = [number, number, number];

export interface RoomCamera { img_name: string; position: Vec3; rotation: number[][] }
export interface RoomFrame { origin: Vec3; e1: Vec3; up: Vec3; e2: Vec3; units_per_meter: number }
export interface RoomLayout extends RoomFrame { nx: number; ny: number; cell: number; walkable: string }
export interface RoomObject {
  id: string;
  label: string;
  box: { center: Vec3; size: Vec3; yaw: number };
  affordance: { jump_on: boolean; hide_under: boolean; push: boolean; play: boolean };
  physics: { body: string; surface: string; mass_kg?: number; hull?: number[][] };
  surfaces?: { kind: string; top_y: number }[];
  splat?: { file: string; pivot: Vec3 };
}
export interface RoomScene {
  frame: RoomFrame;
  room: { min: [number, number]; max: [number, number] };
  assets: { room: string; room_cut?: string };
  objects: RoomObject[];
}
/** 貓和檢視器共用的物品欄位：name、底部中心 floor_pos_m、尺寸 size_m */
export interface PlacedObject extends RoomObject { name: string; size_m: Vec3; floor_pos_m: Vec3 }
export interface RoomSplat { url: string; position?: Vec3 }

/** 依影格檔名排序（COLMAP 輸出的順序每次不同），拍攝點才會沿著影片走 */
export function sortCameras(cameras: RoomCamera[]): RoomCamera[] {
  return [...cameras].sort((a, b) => a.img_name.localeCompare(b.img_name, undefined, { numeric: true }));
}

/** 相機的旋轉矩陣是 camToWorld（x 右、y 下、z 前），第三欄是相機看的方向 */
export function cameraForward(c: RoomCamera): Vec3 {
  return [c.rotation[0][2], c.rotation[1][2], c.rotation[2][2]];
}

/** 拍攝點範圍的對角線長，當作這間房間的距離單位 */
export function roomUnit(cameras: RoomCamera[]): number {
  const span = [0, 1, 2].map(i => {
    const v = cameras.map(c => c.position[i]);
    return Math.max(...v) - Math.min(...v);
  });
  return Math.max(Math.hypot(...span), 1e-3);
}

export function placeObjects(objects: RoomObject[]): PlacedObject[] {
  return objects.map(o => {
    const [x, y, z] = o.box.center;
    return { ...o, name: o.id, size_m: o.box.size, floor_pos_m: [x, y - o.box.size[1] / 2, z] };
  });
}

/** 物品的掉落目標：最近的拍攝點正下方，人走過的地方一定是空地板。回傳地板座標 x、z */
export function dropTarget(from: [number, number], spots: [number, number][]): [number, number] | null {
  let best: [number, number] | null = null;
  let bestDistance = Infinity;
  for (const p of spots) {
    const d = Math.hypot(p[0] - from[0], p[1] - from[1]);
    if (d > 0.3 && d < bestDistance) { bestDistance = d; best = p; }
  }
  return best;
}

/** 拆開的小物要跟房間一起載入，否則房間原位是空的 */
export function roomSplats(base: string, scene: RoomScene): RoomSplat[] {
  const url = (file: string) => `${base.replace(/\/$/, "")}/${file}`;
  return [
    { url: url(scene.assets.room_cut ?? scene.assets.room) },
    ...(scene.assets.room_cut
      ? scene.objects.flatMap(o => (o.splat ? [{ url: url(o.splat.file), position: o.splat.pivot }] : []))
      : []),
  ];
}
