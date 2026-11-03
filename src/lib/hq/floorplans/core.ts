// 平面圖轉換（#138）的資料存取。寫入一律用登入者 session，讓 RLS 的 virtual_assets 權限把關（沿用 0014 的 policy）。
// 原圖由瀏覽器直傳 Azure Blob（決策 006，避開 Vercel 約 4.5 MB 的請求上限）；資料庫只存路徑。
// 依賴（Supabase client、儲存）由呼叫端傳入，方便測試；正式入口在 server.ts。
import type { MediaStore, UploadTarget } from "@/lib/storage/types";
import { newRoomId } from "../rooms/types";
import {
  addRoom, canRead, checkPlan, isOwnPhotoPath, MAX_ROOM_IMAGES, photoPath, roomImages, cleanName, defaultRoomName, houseStatus, isDefaultRoomName, isHouseId, isOwnPlanPath, isRoomKey, MAX_ROOMS, patchRoom, planExt,
  planPath, readMeta, removeRoom, renameRoom, reserveRoomKey, type FloorplanHouse, type FloorplanMeta, type FloorplanSummary, type PlanProblem,
} from "./types";
import type { FloorplanRoomOut } from "@/lib/ai/schemas";
import { normalizeReading } from "./read";

const TABLE = "meow_room_models";
const READ_TTL_SEC = 10 * 60;  // 規格 §7：原圖網址 10 分鐘有效

/** 只用到的 Supabase client 介面 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Db = { from(table: string): any };
/* eslint-enable @typescript-eslint/no-explicit-any */
export interface Deps { sb: Db; userId: string; store: MediaStore | null; now?: Date }

interface Row {
  id: string; name: string; meta: unknown; updated_at: string;
  created_by?: string | null;
  /** meow_profiles 只有本人或有「用戶權限管理」的管理員讀得到（同 #102 貓咪列表） */
  creator?: { display_name: string | null; email: string | null } | null;
}

export type Fail<C extends string> = { ok: false; code: C };
type Common = "permission_denied" | "not_found" | "busy" | "db_not_ready";

/**
 * 資料庫錯誤分類：缺表／缺欄位（0014、0015 沒執行，或 PostgREST 欄位快取還沒更新）回 db_not_ready，
 * 其他（多半是 RLS 擋下）回 permission_denied。真正的錯誤寫進伺服器紀錄（Vercel Logs）方便查。
 */
const NOT_READY = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
export function dbFail(error: { code?: string; message?: string }, where: string): "db_not_ready" | "permission_denied" {
  console.error(`[floorplans] ${where}:`, error.code, error.message);
  return error.code && NOT_READY.has(error.code) ? "db_not_ready" : "permission_denied";
}

export async function listHouses({ sb, store }: Deps): Promise<{ ok: true; houses: FloorplanSummary[] } | Fail<"db_not_ready" | "permission_denied">> {
  const { data, error } = await sb.from(TABLE).select("id,name,meta,updated_at,created_by,creator:meow_profiles!created_by(display_name,email)").eq("source", "floorplan").order("updated_at", { ascending: false }).limit(50);
  if (error) return { ok: false, code: dbFail(error, "list") };
  // 原圖網址是本機簽 SAS（不連網路），每張卡片都帶上預覽
  const houses = await Promise.all((data as Row[]).map(async r => {
    const rooms = await Promise.all(readMeta(r.meta).rooms.map(async m => ({
      id: m.id, name: m.name, status: m.status,
      imageUrl: store ? await store.readUrl(m.image_path, READ_TTL_SEC).catch(() => null) : null,
    })));
    return {
      id: r.id, name: r.name, roomCount: rooms.length, updatedAt: r.updated_at, rooms,
      createdBy: r.created_by ? r.creator?.display_name || r.creator?.email || null : "系統",
    };
  }));
  return { ok: true, houses };
}

export async function createHouse(deps: Deps, name: unknown): Promise<{ ok: true; id: string } | Fail<"name_required" | "name_taken" | "permission_denied" | "db_not_ready">> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, code: "name_required" };
  // 戶名不重複：也擋住網路慢時連按好幾次建立出同名的戶
  const { data: same } = await deps.sb.from(TABLE).select("id").eq("source", "floorplan").eq("name", clean).limit(1);
  if ((same as unknown[] | null)?.length) return { ok: false, code: "name_taken" };
  const now = deps.now ?? new Date();
  const base = newRoomId(now);
  const meta: FloorplanMeta = { version: 1, next: 1, rooms: [] };
  let last: { code?: string; message?: string } = {};
  // 同一秒建立兩戶：id 加尾碼
  for (let i = 1; i <= 5; i++) {
    const id = i === 1 ? base : `${base}_${i}`;
    const { error } = await deps.sb.from(TABLE).insert({
      id, name: clean, status: "ready", source: "floorplan", meta, created_by: deps.userId, updated_at: now.toISOString(),
    });
    if (!error) return { ok: true, id };
    last = error;
    if (error.code !== "23505") break;
  }
  return { ok: false, code: dbFail(last, "create") };
}

async function readHouse(sb: Db, id: string): Promise<Row | null> {
  if (!isHouseId(id)) return null;
  const { data } = await sb.from(TABLE).select("id,name,meta,updated_at").eq("id", id).eq("source", "floorplan").maybeSingle();
  return (data as Row | null) ?? null;
}

export async function getHouse({ sb, store }: Deps, id: string): Promise<FloorplanHouse | null> {
  const row = await readHouse(sb, id);
  if (!row) return null;
  // ai_raw 只留在資料庫除錯用，不送到畫面
  const rooms = await Promise.all(readMeta(row.meta).rooms.map(async room => {
    const r = { ...room };
    delete r.ai_raw;
    const sign = async (path: string) => (store ? await store.readUrl(path, READ_TTL_SEC).catch(() => null) : null);
    const photoUrls = await Promise.all((r.photo_paths ?? []).map(async path => ({ path, url: await sign(path) })));
    return { ...r, imageUrl: await sign(r.image_path), photoUrls };
  }));
  return { id: row.id, name: row.name, updatedAt: row.updated_at, rooms };
}

/**
 * 改 meta.rooms：以 updated_at 當版本號，別人同時改過就重讀再試（最多 3 次），避免兩個人同時上傳互相蓋掉。
 * change 回傳字串＝錯誤代碼，不寫入。
 */
async function mutateMeta<C extends string, T>(
  deps: Deps, id: string, change: (meta: FloorplanMeta) => { meta: FloorplanMeta; value: T } | C,
): Promise<{ ok: true; value: T } | Fail<C | Common>> {
  // 一戶多間同時讀圖完成時會互相撞版本，多試幾次
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await readHouse(deps.sb, id);
    if (!row) return { ok: false, code: "not_found" };
    const result = change(readMeta(row.meta));
    if (typeof result === "string") return { ok: false, code: result };
    const { data, error } = await deps.sb.from(TABLE)
      .update({ meta: result.meta, status: houseStatus(result.meta), updated_at: (deps.now ?? new Date()).toISOString() })
      .eq("id", id).eq("updated_at", row.updated_at).select("id");
    if (error) return { ok: false, code: dbFail(error, "update") };
    if ((data as unknown[] | null)?.length) return { ok: true, value: result.value };
  }
  return { ok: false, code: "busy" };
}

export type RoomTicket = { ok: true; roomId: string; path: string; upload: UploadTarget };

/** 上傳第一步：檢查檔案、保留房間編號、簽 Azure 上傳網址 */
export async function createRoomUpload(deps: Deps, houseId: string, type: unknown, size: unknown): Promise<
  RoomTicket | Fail<PlanProblem | "storage_disabled" | "too_many_rooms" | Common>
> {
  const problem = checkPlan(type, size);
  if (problem) return { ok: false, code: problem };
  if (!deps.store) return { ok: false, code: "storage_disabled" };
  const r = await mutateMeta(deps, houseId, meta => {
    if (meta.rooms.length >= MAX_ROOMS) return "too_many_rooms" as const;
    const { id, meta: next } = reserveRoomKey(meta);
    return { meta: next, value: id };
  });
  if (!r.ok) return r;
  const path = planPath(houseId, r.value, planExt(type)!);
  return { ok: true, roomId: r.value, path, upload: await deps.store.uploadUrl(path, type as string) };
}

/** 上傳第二步：確認原圖真的傳上去了，再把房間加進這一戶 */
export async function addUploadedRoom(deps: Deps, houseId: string, input: { roomId: unknown; path: unknown; name: unknown }): Promise<
  { ok: true; roomId: string } | Fail<"room_invalid" | "upload_missing" | "storage_disabled" | "too_many_rooms" | "name_required" | Common>
> {
  const { roomId, path } = input;
  if (!isRoomKey(roomId) || !isOwnPlanPath(houseId, roomId, path)) return { ok: false, code: "room_invalid" };
  if (!deps.store) return { ok: false, code: "storage_disabled" };
  if (!(await deps.store.list(`floorplans/${houseId}/`)).includes(path as string)) return { ok: false, code: "upload_missing" };
  // 房間名稱選填：空白用「房間 N」（PR 2 起 AI 會讀出房名）
  const blank = typeof input.name !== "string" || !input.name.trim();
  const typed = blank ? null : cleanName(input.name);
  if (!blank && !typed) return { ok: false, code: "name_required" };
  const r = await mutateMeta(deps, houseId, meta => {
    const next = addRoom(meta, {
      id: roomId, name: typed ?? defaultRoomName(meta), image_path: path as string, status: "uploaded",
      created_at: (deps.now ?? new Date()).toISOString(),
    });
    return typeof next === "string" ? next : { meta: next, value: undefined };
  });
  if (!r.ok) {
    await deps.store.remove(path as string);  // 沒加進去的原圖不留著
    return r;
  }
  return { ok: true, roomId };
}

export async function renameHouseRoom(deps: Deps, houseId: string, roomId: string, name: unknown): Promise<{ ok: true } | Fail<"name_required" | Common>> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, code: "name_required" };
  const r = await mutateMeta(deps, houseId, meta => {
    const next = renameRoom(meta, roomId, clean);
    return next ? { meta: next, value: undefined } : "not_found" as const;
  });
  return r.ok ? { ok: true } : r;
}

export async function deleteHouseRoom(deps: Deps, houseId: string, roomId: string): Promise<{ ok: true } | Fail<Common>> {
  const r = await mutateMeta(deps, houseId, meta => {
    const { meta: next, removed } = removeRoom(meta, roomId);
    return removed ? { meta: next, value: removed } : "not_found" as const;
  });
  if (!r.ok) return r;
  for (const path of roomImages(r.value)) await deps.store?.remove(path);
  return { ok: true };
}

export async function deleteHouse(deps: Deps, houseId: string): Promise<{ ok: true } | Fail<"not_found" | "permission_denied" | "db_not_ready">> {
  const row = await readHouse(deps.sb, houseId);
  if (!row) return { ok: false, code: "not_found" };
  const { error } = await deps.sb.from(TABLE).delete().eq("id", houseId).eq("source", "floorplan");
  if (error) return { ok: false, code: dbFail(error, "delete") };
  // 戶刪掉後原圖一併刪（含上傳到一半、沒加進房間的）
  if (deps.store) for (const p of await deps.store.list(`floorplans/${houseId}/`)) await deps.store.remove(p);
  return { ok: true };
}

/** AI 讀圖：讀不到（未設定、逾時、格式錯）回 null。正式入口是 src/lib/ai/server.ts 的 readFloorplanRoom */
export type FloorplanReader = (images: { mime: string; bytes: Uint8Array }[], roomName: string | null) => Promise<FloorplanRoomOut | null>;

/**
 * 讀圖第一步：把房間標成「讀圖中」。回傳 run，由 API 用 after() 在背景執行（約 20～60 秒），畫面輪詢看結果。
 * 讀圖中（且還沒逾時）的房間不重複開始。
 */
export async function startRoomRead(deps: Deps, houseId: string, roomId: unknown, reader: FloorplanReader): Promise<
  { ok: true; run: () => Promise<void> } | Fail<"room_invalid" | "storage_disabled" | Common>
> {
  if (!isRoomKey(roomId)) return { ok: false, code: "room_invalid" };
  if (!deps.store) return { ok: false, code: "storage_disabled" };
  const startedAt = (deps.now ?? new Date()).toISOString();
  const r = await mutateMeta(deps, houseId, meta => {
    const room = meta.rooms.find(x => x.id === roomId);
    if (!room) return "not_found" as const;
    if (!canRead(room, deps.now ?? new Date())) return "busy" as const;
    return { meta: patchRoom(meta, roomId, { status: "reading", error: null, read_started_at: startedAt })!, value: room };
  });
  if (!r.ok) return r;
  const room = r.value;
  return { ok: true, run: () => finishRoomRead(deps, houseId, roomId, roomImages(room), room.name, startedAt, reader) };
}

async function finishRoomRead(
  deps: Deps, houseId: string, roomId: string, paths: string[], roomName: string, startedAt: string, reader: FloorplanReader,
): Promise<void> {
  const files = await Promise.all(paths.map(async path => {
    const bytes = await deps.store!.download(path).catch(() => null);
    return bytes ? { mime: path.endsWith(".png") ? "image/png" : "image/jpeg", bytes } : null;
  }));
  const images = files.filter(f => f !== null);
  const missing = images.length !== paths.length;
  const out = missing ? null : await reader(images, isDefaultRoomName(roomName) ? null : roomName);
  const result = missing ? { ok: false as const, error: "讀不到原圖，請重新上傳" }
    : !out ? { ok: false as const, error: "AI 讀圖失敗或逾時，請重新讀圖" }
      : normalizeReading(out);
  await mutateMeta(deps, houseId, meta => {
    const room = meta.rooms.find(x => x.id === roomId);
    // 讀圖期間房間被刪掉，或已經又開始了新的一次讀圖：這次結果不寫入
    if (!room || room.read_started_at !== startedAt) return "not_found" as const;
    const patch = result.ok
      ? { ...result.geometry, status: "ready" as const, error: null, ai_raw: out, edited: false,
        ...(result.name && isDefaultRoomName(room.name) ? { name: result.name } : {}) }
      : { status: "failed" as const, error: result.error, ...(out ? { ai_raw: out } : {}) };
    return { meta: patchRoom(meta, roomId, patch)!, value: undefined };
  });
}

/** 其他角度照片（#144）第一步：檢查檔案與張數、簽 Azure 上傳網址（隨機檔名，不用先保留編號） */
export async function createPhotoUpload(deps: Deps, houseId: string, roomId: string, type: unknown, size: unknown): Promise<
  { ok: true; path: string; upload: UploadTarget } | Fail<PlanProblem | "storage_disabled" | "too_many_images" | "not_found">
> {
  const problem = checkPlan(type, size);
  if (problem) return { ok: false, code: problem };
  if (!deps.store) return { ok: false, code: "storage_disabled" };
  const row = await readHouse(deps.sb, houseId);
  const room = row && readMeta(row.meta).rooms.find(r => r.id === roomId);
  if (!room) return { ok: false, code: "not_found" };
  if (roomImages(room).length >= MAX_ROOM_IMAGES) return { ok: false, code: "too_many_images" };
  const code = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 6);
  const path = photoPath(houseId, roomId, code, planExt(type)!);
  return { ok: true, path, upload: await deps.store.uploadUrl(path, type as string) };
}

/** 其他角度照片第二步：確認已上傳後加進房間（之後由 API 自動重新讀圖） */
export async function addRoomPhoto(deps: Deps, houseId: string, roomId: string, path: unknown): Promise<
  { ok: true } | Fail<"room_invalid" | "upload_missing" | "storage_disabled" | "too_many_images" | Common>
> {
  if (!isOwnPhotoPath(houseId, roomId, path)) return { ok: false, code: "room_invalid" };
  if (!deps.store) return { ok: false, code: "storage_disabled" };
  if (!(await deps.store.list(`floorplans/${houseId}/`)).includes(path)) return { ok: false, code: "upload_missing" };
  const r = await mutateMeta(deps, houseId, meta => {
    const room = meta.rooms.find(x => x.id === roomId);
    if (!room) return "not_found" as const;
    if (roomImages(room).includes(path)) return "room_invalid" as const;
    if (roomImages(room).length >= MAX_ROOM_IMAGES) return "too_many_images" as const;
    return { meta: patchRoom(meta, roomId, { photo_paths: [...(room.photo_paths ?? []), path] })!, value: undefined };
  });
  if (!r.ok) {
    await deps.store.remove(path);  // 沒加進去的照片不留著
    return r;
  }
  return { ok: true };
}

/** 移除一張其他角度照片（主圖不能單獨移除，要刪整間房） */
export async function removeRoomPhoto(deps: Deps, houseId: string, roomId: string, path: unknown): Promise<{ ok: true } | Fail<"room_invalid" | Common>> {
  if (!isOwnPhotoPath(houseId, roomId, path)) return { ok: false, code: "room_invalid" };
  const r = await mutateMeta(deps, houseId, meta => {
    const room = meta.rooms.find(x => x.id === roomId);
    if (!room?.photo_paths?.includes(path)) return "not_found" as const;
    return { meta: patchRoom(meta, roomId, { photo_paths: room.photo_paths.filter(p => p !== path) })!, value: undefined };
  });
  if (!r.ok) return r;
  await deps.store?.remove(path);
  return { ok: true };
}
