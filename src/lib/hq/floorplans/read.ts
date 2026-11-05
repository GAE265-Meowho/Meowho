// 平面圖讀圖（#138，規格 docs/hq/05 §4.2、§5；實景照片 #144）：AI 輸出 → meta 的格局格式，並檢查是否合理。純函式。
// 數值只做單位整理與預設值，不替 AI 補牆或補家具；不合理就整間標 failed，讓管理員重新讀圖或之後在線框修正。
import { FLOORPLAN_FURNITURE_KINDS, type FloorplanRoomOut } from "@/lib/ai/schemas";
import type { PlanFurniture, PlanGeometry, PlanOpening, PlanWall, Point } from "./types";

export const DEFAULT_WALL_HEIGHT_M = 2.8;
export const DEFAULT_WALL_T_M = 0.15;
/** 單邊長度的合理範圍（規格 §5） */
export const ROOM_SIDE_MIN_M = 1;
export const ROOM_SIDE_MAX_M = 20;
/** 牆端點相距多少以內算接上（公尺） */
const JOIN_TOL_M = 0.3;
/** 家具可以超出房間範圍多少（畫圖誤差） */
const FURNITURE_TOL_M = 0.3;

/** 方塊家具的預設高度（公尺）；可以讓貓跳上去的家具頂面標 walkable */
export const FURNITURE_HEIGHT_M: Record<(typeof FLOORPLAN_FURNITURE_KINDS)[number], number> = {
  sofa: 0.8, bed: 0.5, table: 0.75, chair: 0.9, desk: 0.75, wardrobe: 2.0, cabinet: 0.9,
  tv_stand: 0.5, counter: 0.9, toilet: 0.4, bathtub: 0.6,
  fan: 1.0, computer: 0.45, cup: 0.12, vase: 0.35, notebook: 0.03, other: 0.8,
};
const WALKABLE = new Set(["sofa", "bed", "table", "desk", "cabinet", "tv_stand", "counter"]);
/** 可承載桌上／檯面小物的父家具 */
const SURFACE_PARENTS = new Set(["desk", "table", "cabinet", "counter"]);
/** 最小平面尺寸（杯子等小物可小於 0.1 m） */
const FURNITURE_MIN_M = 0.04;
/** 永不 nested 的 kind（即使 AI 填了 parent） */
const FLOOR_ONLY = new Set(["fan"]);
const DOOR_H_M = 2.1;
const WINDOW_H_M = 1.2;
const WINDOW_SILL_M = 0.9;

export type ReadResult = { ok: true; name: string | null; geometry: PlanGeometry } | { ok: false; error: string };

const round = (n: number) => Math.round(n * 1000) / 1000;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/**
 * 靠牆家具（Tina 2026-11-03：照片推估的家具位置偏差大）：AI 只要說靠哪面牆、大概在牆的哪一段，
 * 由這裡把家具貼齊牆的內側、背面朝牆，並限制在牆的範圍內。
 * 方向：模型背面在 rot=0 時朝平面 -y（scene.ts 的 rotY = -rot），要讓背面朝向牆外 (nx, ny)。
 */
export function snapToWall(wall: PlanWall, walls: PlanWall[], f: { x: number; y: number; w: number; d: number }): { x: number; y: number; rot: number } {
  const L = dist(wall.a, wall.b);
  const ux = (wall.b[0] - wall.a[0]) / L, uy = (wall.b[1] - wall.a[1]) / L;
  // 牆外側：兩個法線中，遠離所有牆端點中心的那一個
  const pts = walls.flatMap(w => [w.a, w.b]);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let nx = -uy, ny = ux;
  const mx = (wall.a[0] + wall.b[0]) / 2 - cx, my = (wall.a[1] + wall.b[1]) / 2 - cy;
  if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
  // 沿牆位置：AI 的中心投影到牆上，家具不超出牆的兩端
  const half = Math.min(f.w, L) / 2;
  const s = Math.min(Math.max((f.x - wall.a[0]) * ux + (f.y - wall.a[1]) * uy, half), L - half);
  const inset = wall.t / 2 + f.d / 2 + 0.01;
  const x = wall.a[0] + ux * s - nx * inset, y = wall.a[1] + uy * s - ny * inset;
  // 背面朝牆外：rot=0 背面朝 (0, -1)；轉 rot 度後背面＝(sin, -cos)…以 rotY=-rot 的 three.js 慣例換算
  const rot = (Math.atan2(nx, -ny) * 180) / Math.PI;
  return { x: round(x), y: round(y), rot: round(((rot % 360) + 360) % 360) };
}

/** 把桌上物中心限制在父家具頂面內（軸對齊近似；父家具已貼齊牆後通常接近軸對齊） */
export function snapToParent(parent: PlanFurniture, f: { x: number; y: number; w: number; d: number }): { x: number; y: number; elev: number; rot: number } {
  const marginX = Math.min(f.w / 2, parent.w / 2);
  const marginY = Math.min(f.d / 2, parent.d / 2);
  return {
    x: round(clamp(f.x, parent.x - parent.w / 2 + marginX, parent.x + parent.w / 2 - marginX)),
    y: round(clamp(f.y, parent.y - parent.d / 2 + marginY, parent.y + parent.d / 2 - marginY)),
    elev: parent.h,
    rot: parent.rot,
  };
}

type AiFurniture = FloorplanRoomOut["furniture"][number];

function floorFurniture(
  f: AiFurniture,
  walls: PlanWall[],
  wallIndex: Map<number, number>,
  inside: (x: number, y: number) => boolean,
): PlanFurniture | null {
  if (![f.x, f.y, f.w, f.d].every(finite) || f.w <= FURNITURE_MIN_M || f.d <= FURNITURE_MIN_M || f.w > ROOM_SIDE_MAX_M || f.d > ROOM_SIDE_MAX_M || !inside(f.x, f.y)) return null;
  const wi = f.wall === null || f.wall === undefined ? undefined : wallIndex.get(f.wall);
  const snapped = wi === undefined ? null : snapToWall(walls[wi], walls, { x: f.x, y: f.y, w: f.w, d: f.d });
  const item: PlanFurniture = {
    kind: f.kind, label: f.label.trim().slice(0, 20) || f.kind,
    ...(snapped ?? { x: round(f.x), y: round(f.y), rot: finite(f.rot) ? round(f.rot) : 0 }),
    w: round(f.w), d: round(f.d), h: FURNITURE_HEIGHT_M[f.kind],
    ...(wi !== undefined && snapped ? { wall: wi } : {}),
  };
  return WALKABLE.has(f.kind) ? { ...item, surface: "walkable" } : item;
}

export function normalizeReading(out: FloorplanRoomOut): ReadResult {
  if (out.kind === "other") return { ok: false, error: "看起來不是平面圖或室內照片，請換一張" };

  // 丟掉不合格的牆；門窗、家具的牆索引要跟著換成整理後的索引（index：AI 給的 → 整理後）
  const index = new Map<number, number>();
  const walls: PlanWall[] = [];
  out.walls.forEach((w, i) => {
    if (![w.ax, w.ay, w.bx, w.by].every(finite)) return;
    const wall = {
      a: [round(w.ax), round(w.ay)] as Point,
      b: [round(w.bx), round(w.by)] as Point,
      t: finite(w.t) && w.t > 0 && w.t <= 0.5 ? round(w.t) : DEFAULT_WALL_T_M,
    };
    if (dist(wall.a, wall.b) <= 0.05) return;
    index.set(i, walls.length);
    walls.push(wall);
  });
  if (walls.length < 3) return { ok: false, error: "AI 讀到的牆少於 3 面，請重新讀圖" };

  // 大致封閉：每個端點都要接到另一面牆的端點
  const ends = walls.flatMap((w, i) => [{ p: w.a, i }, { p: w.b, i }]);
  if (!ends.every(e => ends.some(o => o.i !== e.i && dist(o.p, e.p) <= JOIN_TOL_M))) {
    return { ok: false, error: "AI 讀到的牆沒有圍成封閉的房間，請重新讀圖" };
  }

  const xs = ends.map(e => e.p[0]);
  const ys = ends.map(e => e.p[1]);
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const sides = [box.maxX - box.minX, box.maxY - box.minY];
  if (sides.some(s => s < ROOM_SIDE_MIN_M || s > ROOM_SIDE_MAX_M)) {
    return { ok: false, error: `房間大小不合理（${sides.map(s => s.toFixed(1)).join(" × ")} 公尺），請重新讀圖或之後修正比例` };
  }

  // 門窗：牆索引要存在；超出牆長的部分截掉，截完太窄就丟掉
  const openings: PlanOpening[] = out.openings.flatMap(o => {
    const wi = index.get(o.wall);
    const wall = wi === undefined ? undefined : walls[wi];
    if (!wall || wi === undefined || !finite(o.at) || !finite(o.w)) return [];
    const len = dist(wall.a, wall.b);
    const at = Math.max(0, o.at);
    const w = Math.min(o.w, len - at);
    if (w < 0.3) return [];
    return [o.kind === "door"
      ? { kind: "door" as const, wall: wi, at: round(at), w: round(w), h: DOOR_H_M }
      : { kind: "window" as const, wall: wi, at: round(at), w: round(w), h: WINDOW_H_M, sill: WINDOW_SILL_M }];
  });

  const inside = (x: number, y: number) =>
    x >= box.minX - FURNITURE_TOL_M && x <= box.maxX + FURNITURE_TOL_M && y >= box.minY - FURNITURE_TOL_M && y <= box.maxY + FURNITURE_TOL_M;

  // 先落地家具（含風扇），再 nested（電腦貼桌）；parent 索引對 AI 的 furniture 陣列
  const furniture: PlanFurniture[] = [];
  const aiToOut = new Map<number, number>();
  const nested: { aiIndex: number; f: AiFurniture; parentAi: number }[] = [];

  out.furniture.forEach((f, aiIndex) => {
    const parentAi = f.parent;
    const wantsNest = typeof parentAi === "number" && Number.isInteger(parentAi) && parentAi !== aiIndex && !FLOOR_ONLY.has(f.kind);
    if (wantsNest) {
      nested.push({ aiIndex, f, parentAi: parentAi as number });
      return;
    }
    const item = floorFurniture(f, walls, index, inside);
    if (!item) return;
    aiToOut.set(aiIndex, furniture.length);
    furniture.push(item);
  });

  for (const { aiIndex, f, parentAi } of nested) {
    if (![f.x, f.y, f.w, f.d].every(finite) || f.w <= FURNITURE_MIN_M || f.d <= FURNITURE_MIN_M || f.w > ROOM_SIDE_MAX_M || f.d > ROOM_SIDE_MAX_M || !inside(f.x, f.y)) continue;
    const parentOut = aiToOut.get(parentAi);
    const parent = parentOut === undefined ? undefined : furniture[parentOut];
    if (parent && SURFACE_PARENTS.has(parent.kind)) {
      const snapped = snapToParent(parent, { x: f.x, y: f.y, w: f.w, d: f.d });
      const item: PlanFurniture = {
        kind: f.kind, label: f.label.trim().slice(0, 20) || f.kind,
        x: snapped.x, y: snapped.y, rot: snapped.rot,
        w: round(f.w), d: round(f.d), h: FURNITURE_HEIGHT_M[f.kind],
        parent: parentOut, elev: snapped.elev,
      };
      aiToOut.set(aiIndex, furniture.length);
      furniture.push(item);
      continue;
    }
    // parent 不合法：改當落地（螢幕沒桌子時仍顯示）
    const item = floorFurniture(f, walls, index, inside);
    if (!item) continue;
    aiToOut.set(aiIndex, furniture.length);
    furniture.push(item);
  }

  const height = finite(out.wallHeightM) && out.wallHeightM >= 2 && out.wallHeightM <= 5 ? round(out.wallHeightM) : DEFAULT_WALL_HEIGHT_M;
  // 實景照片沒有固定比例尺：一律記為推估（#144）
  const photo = out.kind === "photo";
  const mPerPx = !photo && finite(out.scale.mPerPx) && out.scale.mPerPx > 0 ? out.scale.mPerPx : null;
  const name = out.name?.trim().slice(0, 40) || null;
  return {
    ok: true, name,
    geometry: { input: out.kind, scale: { m_per_px: mPerPx, source: photo ? "estimate" : out.scale.source }, wall_height_m: height, walls, openings, furniture },
  };
}
