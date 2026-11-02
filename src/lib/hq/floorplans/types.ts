// 平面圖轉 3D 室內空間（#138，規格 docs/hq/05）前後端共用的規則。純函式。
// 一戶＝meow_room_models 一列（source = 'floorplan'）；房間放 meta.rooms，原圖在 Azure Blob，只存路徑。
import { ROOM_ID_RE } from "../rooms/types";

export const MAX_PLAN_BYTES = 10 * 1024 * 1024;
/** 一戶最多幾間（規格 §10） */
export const MAX_ROOMS = 8;
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

/** 存在 meta.rooms 的一間房（PR 2 起會再加上 AI 讀出的 walls／openings／furniture／scale） */
export interface PlanRoom {
  id: string;
  name: string;
  image_path: string;
  status: PlanRoomStatus;
  error?: string | null;
  created_at: string;
}
/** next：下一個房間編號。拿上傳網址時就先保留，刪掉的編號不重用，避免舊原圖對到新房間 */
export interface FloorplanMeta { version: 1; next: number; rooms: PlanRoom[] }

/** 畫面用：房間加上有時效的原圖網址 */
export interface PlanRoomView extends PlanRoom { imageUrl: string | null }
/** createdBy：建立者顯示名稱；讀不到個人資料時為 null（畫面顯示「—」） */
export interface FloorplanSummary { id: string; name: string; roomCount: number; updatedAt: string; createdBy: string | null }
export interface FloorplanHouse { id: string; name: string; updatedAt: string; rooms: PlanRoomView[] }

export const isHouseId = (v: unknown): v is string => typeof v === "string" && ROOM_ID_RE.test(v);
export const isRoomKey = (v: unknown): v is string => typeof v === "string" && ROOM_KEY_RE.test(v);

/** 原圖路徑：floorplans/<戶 id>/<房間 id>.<png|jpg> */
export const planPath = (houseId: string, roomId: string, ext: string) => `floorplans/${houseId}/${roomId}.${ext}`;
export const isOwnPlanPath = (houseId: string, roomId: string, path: unknown) =>
  typeof path === "string" && new RegExp(`^floorplans/${houseId}/${roomId}\\.(png|jpg)$`).test(path);

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
