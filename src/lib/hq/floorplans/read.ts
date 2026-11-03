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
  tv_stand: 0.5, counter: 0.9, toilet: 0.4, bathtub: 0.6, other: 0.8,
};
const WALKABLE = new Set(["sofa", "bed", "table", "desk", "cabinet", "tv_stand", "counter"]);
const DOOR_H_M = 2.1;
const WINDOW_H_M = 1.2;
const WINDOW_SILL_M = 0.9;

export type ReadResult = { ok: true; name: string | null; geometry: PlanGeometry } | { ok: false; error: string };

const round = (n: number) => Math.round(n * 1000) / 1000;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);

export function normalizeReading(out: FloorplanRoomOut): ReadResult {
  if (out.kind === "other") return { ok: false, error: "看起來不是平面圖或室內照片，請換一張" };

  const walls: PlanWall[] = out.walls
    .filter(w => [w.ax, w.ay, w.bx, w.by].every(finite))
    .map(w => ({
      a: [round(w.ax), round(w.ay)] as Point,
      b: [round(w.bx), round(w.by)] as Point,
      t: finite(w.t) && w.t > 0 && w.t <= 0.5 ? round(w.t) : DEFAULT_WALL_T_M,
    }))
    .filter(w => dist(w.a, w.b) > 0.05);
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
    const wall = walls[o.wall];
    if (!wall || !finite(o.at) || !finite(o.w)) return [];
    const len = dist(wall.a, wall.b);
    const at = Math.max(0, o.at);
    const w = Math.min(o.w, len - at);
    if (w < 0.3) return [];
    return [o.kind === "door"
      ? { kind: "door" as const, wall: o.wall, at: round(at), w: round(w), h: DOOR_H_M }
      : { kind: "window" as const, wall: o.wall, at: round(at), w: round(w), h: WINDOW_H_M, sill: WINDOW_SILL_M }];
  });

  // 家具：尺寸要合理、中心要在房間內（容許畫圖誤差）
  const inside = (x: number, y: number) =>
    x >= box.minX - FURNITURE_TOL_M && x <= box.maxX + FURNITURE_TOL_M && y >= box.minY - FURNITURE_TOL_M && y <= box.maxY + FURNITURE_TOL_M;
  const furniture: PlanFurniture[] = out.furniture.flatMap(f => {
    if (![f.x, f.y, f.w, f.d].every(finite) || f.w <= 0.1 || f.d <= 0.1 || f.w > ROOM_SIDE_MAX_M || f.d > ROOM_SIDE_MAX_M || !inside(f.x, f.y)) return [];
    const item: PlanFurniture = {
      kind: f.kind, label: f.label.trim().slice(0, 20) || f.kind,
      x: round(f.x), y: round(f.y), w: round(f.w), d: round(f.d), h: FURNITURE_HEIGHT_M[f.kind], rot: finite(f.rot) ? round(f.rot) : 0,
    };
    return [WALKABLE.has(f.kind) ? { ...item, surface: "walkable" as const } : item];
  });

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
