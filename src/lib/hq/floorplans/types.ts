// 平面圖轉 3D 室內空間（#138，規格 docs/hq/05）前後端共用的規則。純函式。
// 一戶＝meow_room_models 一列（source = 'floorplan'）；房間放 meta.rooms，原圖在 Azure Blob，只存路徑。
import { ROOM_ID_RE } from "../rooms/types";

export const MAX_PLAN_BYTES = 10 * 1024 * 1024;
/** 一戶最多幾間（規格 §10） */
export const MAX_ROOMS = 8;
/** 一間房最多幾張圖（主圖＋其他角度，#144） */
export const MAX_ROOM_IMAGES = 4;
export const NAME_MAX = 40;
export const ROOM_KEY_RE = /^r\d{1,3}$/;

const PLAN_EXT_BY_TYPE: Record<string, "png" | "jpg"> = { "image/png": "png", "image/jpeg": "jpg" };
export const planExt = (type: unknown) => (typeof type === "string" ? PLAN_EXT_BY_TYPE[type] ?? null : null);

export type PlanProblem = "plan_invalid" | "plan_too_large";
export function checkPlan(type: unknown, size: unknown): PlanProblem | null {
  if (!planExt(type) || typeof size !== "number" || size <= 0) return "plan_invalid";
  return size > MAX_PLAN_BYTES ? "plan_too_large" : null;
}

/** 房間狀態：uploaded＝已上傳、等 AI 讀圖（PR 2 起自動開始）；reading／ready／failed 由 AI 讀圖使用 */
export type PlanRoomStatus = "uploaded" | "reading" | "ready" | "failed";
export const PLAN_ROOM_STATUS_LABELS: Record<PlanRoomStatus, string> = {
  uploaded: "待讀圖", reading: "讀圖中", ready: "完成", failed: "讀圖失敗",
};

/** AI 讀出的格局（規格 §4.2），公尺、平面座標 (x, y) */
export type Point = [number, number];
export interface PlanWall { a: Point; b: Point; t: number }
export interface PlanOpening { kind: "door" | "window"; wall: number; at: number; w: number; h: number; sill?: number }
/** wall：背面靠著的牆（索引）；靠牆時 w 沿牆、d 離牆，x／y／rot 已由系統貼齊（read.ts 的 snapToWall） */
export interface PlanFurniture { kind: string; label: string; x: number; y: number; w: number; d: number; h: number; rot: number; wall?: number; surface?: "walkable" }
export interface PlanGeometry {
  /** AI 讀的是平面圖還是實景照片（#144）；實景照片的比例一律是推估 */
  input: "floorplan" | "photo";
  scale: { m_per_px: number | null; source: "label" | "estimate" | "manual" };
  wall_height_m: number;
  walls: PlanWall[];
  openings: PlanOpening[];
  furniture: PlanFurniture[];
}

/** 存在 meta.rooms 的一間房；讀圖完成（ready）後才有格局欄位 */
export interface PlanRoom extends Partial<PlanGeometry> {
  id: string;
  name: string;
  /** 主圖：平面圖或第一張實景照片 */
  image_path: string;
  /** 同一間房的其他角度實景照片（#144，加主圖最多 MAX_ROOM_IMAGES 張） */
  photo_paths?: string[];
  status: PlanRoomStatus;
  error?: string | null;
  created_at: string;
  /** 開始讀圖的時間：讀圖中太久（函式中斷）時畫面可重新讀圖 */
  read_started_at?: string | null;
  ai_raw?: unknown;
  edited?: boolean;
}
/** next：下一個房間編號。拿上傳網址時就先保留，刪掉的編號不重用，避免舊原圖對到新房間 */
export interface FloorplanMeta { version: 1; next: number; rooms: PlanRoom[] }

/** 畫面用：房間加上有時效的原圖網址 */
export interface PlanRoomView extends PlanRoom { imageUrl: string | null; photoUrls: { path: string; url: string | null }[] }
/** createdBy：建立者顯示名稱；讀不到個人資料時為 null（畫面顯示「—」） */
export interface FloorplanSummary {
  id: string; name: string; roomCount: number; updatedAt: string; createdBy: string | null;
  /** 清單卡片用：各房間名稱、狀態與原圖預覽網址 */
  rooms: Pick<PlanRoomView, "id" | "name" | "status" | "imageUrl">[];
}
export interface FloorplanHouse { id: string; name: string; updatedAt: string; rooms: PlanRoomView[] }

export const isHouseId = (v: unknown): v is string => typeof v === "string" && ROOM_ID_RE.test(v);
export const isRoomKey = (v: unknown): v is string => typeof v === "string" && ROOM_KEY_RE.test(v);

/** 原圖路徑：floorplans/<戶 id>/<房間 id>.<png|jpg> */
export const planPath = (houseId: string, roomId: string, ext: string) => `floorplans/${houseId}/${roomId}.${ext}`;
export const isOwnPlanPath = (houseId: string, roomId: string, path: unknown) =>
  typeof path === "string" && new RegExp(`^floorplans/${houseId}/${roomId}\\.(png|jpg)$`).test(path);
/** 其他角度照片：floorplans/<戶 id>/<房間 id>_<6 碼>.<png|jpg>（隨機碼，不用先保留編號） */
export const photoPath = (houseId: string, roomId: string, code: string, ext: string) => `floorplans/${houseId}/${roomId}_${code}.${ext}`;
export const isOwnPhotoPath = (houseId: string, roomId: string, path: unknown): path is string =>
  typeof path === "string" && new RegExp(`^floorplans/${houseId}/${roomId}_[a-z0-9]{6}\\.(png|jpg)$`).test(path);
/** 一間房的所有圖（主圖在前） */
export const roomImages = (room: Pick<PlanRoom, "image_path" | "photo_paths">) => [room.image_path, ...(room.photo_paths ?? [])];

export function cleanName(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s && s.length <= NAME_MAX ? s : null;
}

/** 讀 meta：格式不對就當沒有房間（舊資料、手改過的資料不讓頁面壞掉） */
export function readMeta(meta: unknown): FloorplanMeta {
  const m = meta as { rooms?: unknown; next?: unknown } | null;
  const rooms = Array.isArray(m?.rooms)
    ? m.rooms.filter((r): r is PlanRoom =>
      !!r && typeof r === "object" && isRoomKey((r as PlanRoom).id) && typeof (r as PlanRoom).image_path === "string")
    : [];
  const maxId = Math.max(0, ...rooms.map(r => Number(r.id.slice(1))));
  const next = typeof m?.next === "number" && Number.isInteger(m.next) ? m.next : 1;
  return { version: 1, next: Math.max(next, maxId + 1), rooms };
}

/** 保留下一個房間 id（r1、r2…）：回傳 id 與 next 加 1 後的 meta */
export function reserveRoomKey(meta: FloorplanMeta): { id: string; meta: FloorplanMeta } {
  return { id: `r${meta.next}`, meta: { ...meta, next: meta.next + 1 } };
}

export const defaultRoomName = (meta: FloorplanMeta) => `房間 ${meta.rooms.length + 1}`;
/** 是不是系統給的預設名稱（AI 讀出房名時只覆蓋預設名稱，不動管理員自己填的） */
export const isDefaultRoomName = (name: string) => /^房間 \d+$/.test(name);

/** 讀圖中超過這個時間視為中斷（Vercel 函式上限 120 秒，留一點餘裕），可以重新讀圖 */
export const READ_STALE_MS = 3 * 60 * 1000;
export const isReadStale = (room: Pick<PlanRoom, "status" | "read_started_at">, now: Date) =>
  room.status === "reading" && (!room.read_started_at || now.getTime() - Date.parse(room.read_started_at) > READ_STALE_MS);
/** 可以（重新）讀圖：待讀圖、失敗、完成（整間重跑）、或讀圖中斷 */
export const canRead = (room: Pick<PlanRoom, "status" | "read_started_at">, now: Date) => room.status !== "reading" || isReadStale(room, now);

/** 一戶的狀態（規格 §4.1）：任一房讀圖中 → running；有房失敗 → failed；其他 → ready */
export function houseStatus(meta: FloorplanMeta): "running" | "ready" | "failed" {
  if (meta.rooms.some(r => r.status === "uploaded" || r.status === "reading")) return "running";
  return meta.rooms.some(r => r.status === "failed") ? "failed" : "ready";
}

/** 改一間房的欄位；房間不存在回 null */
export function patchRoom(meta: FloorplanMeta, roomId: string, patch: Partial<PlanRoom>): FloorplanMeta | null {
  if (!meta.rooms.some(r => r.id === roomId)) return null;
  return { ...meta, rooms: meta.rooms.map(r => (r.id === roomId ? { ...r, ...patch } : r)) };
}

export type AddRoomProblem = "too_many_rooms" | "room_invalid";
export function addRoom(meta: FloorplanMeta, room: PlanRoom): FloorplanMeta | AddRoomProblem {
  if (meta.rooms.some(r => r.id === room.id) || Number(room.id.slice(1)) >= meta.next) return "room_invalid";
  if (meta.rooms.length >= MAX_ROOMS) return "too_many_rooms";
  return { ...meta, rooms: [...meta.rooms, room] };
}

export function removeRoom(meta: FloorplanMeta, roomId: string): { meta: FloorplanMeta; removed: PlanRoom | null } {
  const removed = meta.rooms.find(r => r.id === roomId) ?? null;
  return { meta: { ...meta, rooms: meta.rooms.filter(r => r.id !== roomId) }, removed };
}

export function renameRoom(meta: FloorplanMeta, roomId: string, name: string): FloorplanMeta | null {
  if (!meta.rooms.some(r => r.id === roomId)) return null;
  return { ...meta, rooms: meta.rooms.map(r => (r.id === roomId ? { ...r, name } : r)) };
}
