// 展示房間（#93）：manifest 由影片轉 3D 流程產生，檔案放在 Supabase 的 meow-room-models。
// 網址由 NEXT_PUBLIC_ROOM_DEMO_BASE 提供，不寫進程式：repo 是公開的，房間路徑不進 GitHub。
export type Vec3 = [number, number, number];

export interface RoomCamera { img_name: string; position: Vec3; rotation: number[][] }
export interface RoomFrame { origin: Vec3; e1: Vec3; up: Vec3; e2: Vec3; units_per_meter: number }
export interface RoomLayout extends RoomFrame { nx: number; ny: number; cell: number; walkable: string }
export interface RoomObject {
  id: string;
  label: string;
  /** 中文名稱（label 可能是英文 bed） */
  name_zh?: string;
  box: { center: Vec3; size: Vec3; yaw: number };
  affordance: { jump_on: boolean; hide_under: boolean; push: boolean; play: boolean };
  physics: { body: string; surface: string; mass_kg?: number; hull?: number[][] };
  surfaces?: { kind: string; top_y: number }[];
  splat?: { file: string; pivot: Vec3 };
}
export interface RoomScene {
  frame: RoomFrame;
  room: { min: [number, number]; max: [number, number]; yaw?: number };
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

/** 後台「下載」要打包的成果檔（照 room_worker.py 的 copy_result）：有 room_cut 時沒有 scene.splat */
export function resultFiles(scene: RoomScene): string[] {
  const splats = scene.assets.room_cut
    ? [scene.assets.room_cut, ...scene.objects.flatMap(o => (o.splat ? [o.splat.file] : []))]
    : [scene.assets.room];
  return ["scene.json", "scene.cameras.json", "scene.layout.json", "thumb.jpg", ...splats];
}

/**
 * 鏡頭不能走出房間：拉太遠、降太低會看到牆壁和地板的背面。
 * p 是地板座標（公尺，x、z 水平、y 向上）；room 的 min／max 是沿牆方向（轉 yaw 後）的範圍。
 * 夾在牆內 margin 公尺、高度 minY～maxY 之間。
 */
export type RoomViewName = "front" | "back" | "left" | "right" | "top";
export interface RoomView { pos: Vec3; dir: Vec3 }

/**
 * 前台預覽的五個固定視角（地板座標、公尺）。「前」＝站在門口往房間裡看。
 * 還偵測不到門：用影片第一個拍攝點最靠近的那面牆當門口（多數人從門口開始拍）。
 * handed：地板座標的 e1 × up 是 +e2 為 1、−e2 為 −1，用來分左右。
 */
export function roomViews(room: RoomScene["room"], start: Vec3, handed: number): Record<RoomViewName, RoomView> {
  const c = Math.cos(room.yaw ?? 0), s = Math.sin(room.yaw ?? 0);
  const toFloor = (u: number, v: number): [number, number] => [u * c - v * s, u * s + v * c];
  const [u0, v0] = [start[0] * c + start[2] * s, -start[0] * s + start[2] * c];
  const [umin, vmin] = room.min, [umax, vmax] = room.max;
  const center = [(umin + umax) / 2, (vmin + vmax) / 2];
  // 四面牆：牆中點和朝房間內的方向（房間座標 u、v）
  const walls = [
    { gap: u0 - umin, at: [umin, center[1]], inward: [1, 0], depth: umax - umin },
    { gap: umax - u0, at: [umax, center[1]], inward: [-1, 0], depth: umax - umin },
    { gap: v0 - vmin, at: [center[0], vmin], inward: [0, 1], depth: vmax - vmin },
    { gap: vmax - v0, at: [center[0], vmax], inward: [0, -1], depth: vmax - vmin },
  ];
  const door = walls.reduce((a, b) => (b.gap < a.gap ? b : a));
  const fromWall = (w: typeof door): RoomView => {
    const inset = Math.min(0.5, w.depth * 0.25);
    const [x, z] = toFloor(w.at[0] + w.inward[0] * inset, w.at[1] + w.inward[1] * inset);
    const [dx, dz] = toFloor(w.inward[0], w.inward[1]);
    return { pos: [x, EYE_M, z], dir: [dx, -0.25, dz] };  // 微微往下看，看得到地板和家具
  };
  const opposite = walls.find(w => w.inward[0] === -door.inward[0] && w.inward[1] === -door.inward[1])!;
  const fwd = toFloor(door.inward[0], door.inward[1]);
  const right: [number, number] = [-handed * fwd[1], handed * fwd[0]];  // 面向房間時的右手邊（地板 x、z）
  const sides = walls.filter(w => w !== door && w !== opposite);
  // 站在左牆往右看＝看到房間的左側視角；站的位置在面向房間時的左邊
  const onRight = (w: typeof door) => { const [x, z] = toFloor(w.at[0] - center[0], w.at[1] - center[1]); return x * right[0] + z * right[1] > 0; };
  const [cx, cz] = toFloor(center[0], center[1]);
  return {
    front: fromWall(door),
    back: fromWall(opposite),
    left: fromWall(sides.find(w => !onRight(w))!),
    right: fromWall(sides.find(onRight)!),
    // 天花板附近往下看；方向帶一點「前」，鏡頭的上方對著房間裡面（正下方轉頭會打轉）
    top: { pos: [cx, TOP_M, cz], dir: [fwd[0] * 0.05, -1, fwd[1] * 0.05] },
  };
}
const EYE_M = 1.5;
const TOP_M = 2.15;

export function clampInRoom([x, y, z]: Vec3, room: RoomScene["room"], margin = 0.15, minY = 0.2, maxY = 2.2): Vec3 {
  const c = Math.cos(room.yaw ?? 0), s = Math.sin(room.yaw ?? 0);
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const u = clamp(x * c + z * s, room.min[0] + margin, room.max[0] - margin);
  const v = clamp(-x * s + z * c, room.min[1] + margin, room.max[1] - margin);
  return [u * c - v * s, clamp(y, minY, maxY), u * s + v * c];
}
