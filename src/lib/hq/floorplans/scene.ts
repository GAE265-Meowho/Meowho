// 平面圖 → 3D 娃娃屋的場景資料（#138 步驟 4，規格 docs/hq/05 §6）。純函式，畫面（FloorplanViewer）只照著畫方塊。
// 座標：平面 (x, y) 公尺 → three.js (x, z)，Y 向上、地板 y=0。無天花板（娃娃屋）。
// 同一份方塊也是碰撞體（Rapier cuboid）：牆、門楣、窗台、家具；步驟 5 放貓時接上物理。
import { movesByRoom, omittedByRoom, resolveFurniturePose, type FurnitureMove } from "./experience-furniture";
import type { PlanGeometry, PlanRoom, Point } from "./types";

export type BoxKind = "floor" | "wall" | "lintel" | "sill" | "glass" | "furniture";
/** 一個方塊：中心 (x, y, z)、尺寸 (sx, sy, sz)、繞 Y 軸旋轉 rotY（弧度） */
export interface SceneBox {
  kind: BoxKind;
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  rotY: number;
  /** 家具種類（顏色用） */
  furniture?: string;
  /** 對應 PlanRoom.furniture 原始陣列索引（僅 furniture；虛擬體驗移除／拖移用） */
  furnitureIndex?: number;
  /** 落地家具（無 parent）可在虛擬體驗手掌模式拖移 */
  movable?: boolean;
  /** 貓可以跳上去的家具頂面 */
  walkable?: boolean;
  /** 牆（含門楣、窗台、玻璃）朝房間外的方向 (x, z)：畫面用來把面向鏡頭的牆降低（娃娃屋剖面） */
  out?: [number, number];
}
export interface RoomScene {
  id: string;
  name: string;
  /** 這間房在娃娃屋裡的位置（左上角，世界座標 x、z） */
  offset: [number, number];
  /** 房間寬（x）與深（z），公尺 */
  size: [number, number];
  height: number;
  boxes: SceneBox[];
}

/** 並排時房間之間的走道寬（規格 §6） */
export const ROOM_GAP_M = 1;
const FLOOR_T = 0.05;
const MIN_PIECE_M = 0.02;

const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;  // + 0：把 -0 變成 0

/** 沿著一面牆（a→b）放方塊：s 是從 a 起算的距離中心，len 是長度 */
function along(a: Point, b: Point, s: number, len: number, y: number, h: number, t: number, kind: BoxKind): SceneBox {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L;
  return {
    kind, x: r3(a[0] + ux * s), y: r3(y), z: r3(a[1] + uz * s),
    sx: r3(len), sy: r3(h), sz: r3(t), rotY: r3(-Math.atan2(dz, dx)),
  };
}

/** 一面牆扣掉門窗：實心段＋門楣（門上方）＋窗台、窗玻璃、窗楣 */
function wallBoxes(geo: PlanGeometry, index: number, shift: Point, center: Point): SceneBox[] {
  const w = geo.walls[index];
  const H = geo.wall_height_m;
  const a: Point = [w.a[0] - shift[0], w.a[1] - shift[1]];
  const b: Point = [w.b[0] - shift[0], w.b[1] - shift[1]];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  // 兩端各多延伸半個牆厚，轉角才不會有縫；門窗的位置跟著往後推半個牆厚
  const ext = w.t / 2;
  const total = L + w.t;
  const a2: Point = [a[0] - (b[0] - a[0]) / L * ext, a[1] - (b[1] - a[1]) / L * ext];
  const ops = geo.openings.filter(o => o.wall === index).sort((p, q) => p.at - q.at);
  // 朝外方向：牆的法線中，指離房間中心的那一個
  const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
  const mx = (a[0] + b[0]) / 2 - center[0], mz = (a[1] + b[1]) / 2 - center[1];
  const out: [number, number] = nx * mx + nz * mz >= 0 ? [r3(nx), r3(nz)] : [r3(-nx), r3(-nz)];
  const piece = (s: number, len: number, y: number, h: number, t: number, kind: BoxKind) => ({ ...along(a2, b, s, len, y, h, t, kind), out });

  const pieces: SceneBox[] = [];
  let cursor = 0;
  for (const o of ops) {
    const start = Math.max(cursor, o.at + ext);
    const end = Math.min(total, o.at + ext + o.w);
    if (end - start < MIN_PIECE_M) continue;  // 和前一個開口重疊或超出牆長
    if (start - cursor > MIN_PIECE_M) pieces.push(piece((cursor + start) / 2, start - cursor, H / 2, H, w.t, "wall"));
    const mid = (start + end) / 2, span = end - start;
    const bottom = o.kind === "window" ? Math.min(o.sill ?? 0, H) : 0;
    const top = Math.min(bottom + o.h, H);
    if (bottom > MIN_PIECE_M) pieces.push(piece(mid, span, bottom / 2, bottom, w.t, "sill"));
    if (o.kind === "window" && top - bottom > MIN_PIECE_M) pieces.push(piece(mid, span, (bottom + top) / 2, top - bottom, 0.02, "glass"));
    if (H - top > MIN_PIECE_M) pieces.push(piece(mid, span, (top + H) / 2, H - top, w.t, "lintel"));
    cursor = end;
  }
  if (total - cursor > MIN_PIECE_M) pieces.push(piece((cursor + total) / 2, total - cursor, H / 2, H, w.t, "wall"));
  return pieces;
}

/** 一間房的方塊（座標已平移到房間左上角＝原點）；omit＝要略過的 furniture 原始索引；moves＝session 拖移姿態 */
export function roomBoxes(geo: PlanGeometry, omit?: Set<number>, moves?: Map<number, FurnitureMove>): { boxes: SceneBox[]; size: [number, number] } {
  const xs = geo.walls.flatMap(w => [w.a[0], w.b[0]]);
  const ys = geo.walls.flatMap(w => [w.a[1], w.b[1]]);
  const shift: Point = [Math.min(...xs), Math.min(...ys)];
  const size: [number, number] = [r3(Math.max(...xs) - shift[0]), r3(Math.max(...ys) - shift[1])];

  // 地板用外框矩形（斜牆房間會多出一點地板，之後線框修正再處理）
  const boxes: SceneBox[] = [{ kind: "floor", x: size[0] / 2, y: -FLOOR_T / 2, z: size[1] / 2, sx: size[0], sy: FLOOR_T, sz: size[1], rotY: 0 }];
  const center: Point = [size[0] / 2, size[1] / 2];
  geo.walls.forEach((_, i) => boxes.push(...wallBoxes(geo, i, shift, center)));
  geo.furniture.forEach((f, i) => {
    if (omit?.has(i)) return;
    const elev = f.elev ?? 0;
    const pose = resolveFurniturePose(geo.furniture, i, shift, moves);
    boxes.push({
      kind: "furniture", furniture: f.kind, furnitureIndex: i,
      movable: typeof f.parent !== "number" || undefined,
      walkable: f.surface === "walkable" || undefined,
      x: pose.x, y: r3(elev + f.h / 2), z: pose.z, sx: f.w, sy: f.h, sz: f.d,
      rotY: r3(-(f.rot * Math.PI) / 180),
    });
  });
  return { boxes, size };
}

const hasGeometry = (r: PlanRoom): r is PlanRoom & PlanGeometry =>
  r.status === "ready" && Array.isArray(r.walls) && r.walls.length >= 3 && typeof r.wall_height_m === "number";

/** 整戶娃娃屋：讀圖完成的房間由左到右並排，中間留 1 公尺走道（不拼接，Q10）；removedKeys／furnitureMoves＝虛擬體驗 session */
export function houseScene(
  rooms: PlanRoom[],
  removedKeys?: Iterable<string>,
  furnitureMoves?: Record<string, FurnitureMove> | Map<string, FurnitureMove>,
): RoomScene[] {
  const omitMap = removedKeys ? omittedByRoom(rooms, removedKeys) : null;
  const moveMap = furnitureMoves ? movesByRoom(furnitureMoves) : null;
  let x = 0;
  return rooms.filter(hasGeometry).map(r => {
    const { boxes, size } = roomBoxes({
      input: r.input ?? "floorplan", scale: r.scale ?? { m_per_px: null, source: "estimate" },
      wall_height_m: r.wall_height_m, walls: r.walls, openings: r.openings ?? [], furniture: r.furniture ?? [],
    }, omitMap?.get(r.id), moveMap?.get(r.id));
    const scene: RoomScene = { id: r.id, name: r.name, offset: [r3(x), 0], size, height: r.wall_height_m, boxes };
    x += size[0] + ROOM_GAP_M;
    return scene;
  });
}

/** 要顯示的房間：focus＝null 是整戶並排；指定某間就只放那一間，並移到原點（鏡頭重新取景） */
export function focusScenes(scenes: RoomScene[], focus: string | null): RoomScene[] {
  if (!focus) return scenes;
  const one = scenes.find(s => s.id === focus);
  return one ? [{ ...one, offset: [0, 0] }] : scenes;
}

/** 整戶外框（鏡頭取景用） */
export function sceneBounds(scenes: RoomScene[]): { width: number; depth: number; height: number } {
  return {
    width: scenes.length ? Math.max(...scenes.map(s => s.offset[0] + s.size[0])) : 0,
    depth: scenes.length ? Math.max(...scenes.map(s => s.size[1])) : 0,
    height: scenes.length ? Math.max(...scenes.map(s => s.height)) : 0,
  };
}

/** 碰撞體：玻璃與地板以外的方塊（地板另外用整片地面） */
export const colliders = (scene: RoomScene) => scene.boxes.filter(b => b.kind !== "glass" && b.kind !== "floor");
