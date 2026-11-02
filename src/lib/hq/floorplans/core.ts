// 平面圖轉換（#138）的資料存取。寫入一律用登入者 session，讓 RLS 的 virtual_assets 權限把關（沿用 0014 的 policy）。
// 原圖由瀏覽器直傳 Azure Blob（決策 006，避開 Vercel 約 4.5 MB 的請求上限）；資料庫只存路徑。
// 依賴（Supabase client、儲存）由呼叫端傳入，方便測試；正式入口在 server.ts。
import type { MediaStore, UploadTarget } from "@/lib/storage/types";
import { newRoomId } from "../rooms/types";
import {
  addRoom, checkPlan, cleanName, defaultRoomName, isHouseId, isOwnPlanPath, isRoomKey, MAX_ROOMS, planExt, planPath, readMeta, removeRoom, renameRoom,
  reserveRoomKey, type FloorplanHouse, type FloorplanMeta, type FloorplanSummary, type PlanProblem,
} from "./types";

const TABLE = "meow_room_models";
const READ_TTL_SEC = 10 * 60;  // 規格 §7：原圖網址 10 分鐘有效

/** 只用到的 Supabase client 介面 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Db = { from(table: string): any };
/* eslint-enable @typescript-eslint/no-explicit-any */
export interface Deps { sb: Db; userId: string; store: MediaStore | null; now?: Date }

interface Row { id: string; name: string; meta: unknown; updated_at: string }

export type Fail<C extends string> = { ok: false; code: C };
type Common = "permission_denied" | "not_found" | "busy";

export async function listHouses({ sb }: Deps): Promise<FloorplanSummary[] | null> {
  const { data, error } = await sb.from(TABLE).select("id,name,meta,updated_at").eq("source", "floorplan").order("updated_at", { ascending: false }).limit(50);
  if (error) return null;
  return (data as Row[]).map(r => ({ id: r.id, name: r.name, roomCount: readMeta(r.meta).rooms.length, updatedAt: r.updated_at }));
}

export async function createHouse(deps: Deps, name: unknown): Promise<{ ok: true; id: string } | Fail<"name_required" | "permission_denied">> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, code: "name_required" };
  const now = deps.now ?? new Date();
  const base = newRoomId(now);
  const meta: FloorplanMeta = { version: 1, next: 1, rooms: [] };
  // 同一秒建立兩戶：id 加尾碼
  for (let i = 1; i <= 5; i++) {
    const id = i === 1 ? base : `${base}_${i}`;
    const { error } = await deps.sb.from(TABLE).insert({
      id, name: clean, status: "ready", source: "floorplan", meta, created_by: deps.userId, updated_at: now.toISOString(),
    });
    if (!error) return { ok: true, id };
    if (error.code !== "23505") break;
  }
  return { ok: false, code: "permission_denied" };
}

async function readHouse(sb: Db, id: string): Promise<Row | null> {
  if (!isHouseId(id)) return null;
  const { data } = await sb.from(TABLE).select("id,name,meta,updated_at").eq("id", id).eq("source", "floorplan").maybeSingle();
  return (data as Row | null) ?? null;
}

export async function getHouse({ sb, store }: Deps, id: string): Promise<FloorplanHouse | null> {
  const row = await readHouse(sb, id);
  if (!row) return null;
  const rooms = await Promise.all(readMeta(row.meta).rooms.map(async r => ({
    ...r, imageUrl: store ? await store.readUrl(r.image_path, READ_TTL_SEC).catch(() => null) : null,
  })));
  return { id: row.id, name: row.name, updatedAt: row.updated_at, rooms };
}

/**
 * 改 meta.rooms：以 updated_at 當版本號，別人同時改過就重讀再試（最多 3 次），避免兩個人同時上傳互相蓋掉。
 * change 回傳字串＝錯誤代碼，不寫入。
 */
async function mutateMeta<C extends string, T>(
  deps: Deps, id: string, change: (meta: FloorplanMeta) => { meta: FloorplanMeta; value: T } | C,
): Promise<{ ok: true; value: T } | Fail<C | Common>> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await readHouse(deps.sb, id);
    if (!row) return { ok: false, code: "not_found" };
    const result = change(readMeta(row.meta));
    if (typeof result === "string") return { ok: false, code: result };
    const { data, error } = await deps.sb.from(TABLE)
      .update({ meta: result.meta, updated_at: (deps.now ?? new Date()).toISOString() })
      .eq("id", id).eq("updated_at", row.updated_at).select("id");
    if (error) return { ok: false, code: "permission_denied" };
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
  { ok: true } | Fail<"room_invalid" | "upload_missing" | "storage_disabled" | "too_many_rooms" | "name_required" | Common>
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
  return { ok: true };
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
  await deps.store?.remove(r.value.image_path);
  return { ok: true };
}

export async function deleteHouse(deps: Deps, houseId: string): Promise<{ ok: true } | Fail<"not_found" | "permission_denied">> {
  const row = await readHouse(deps.sb, houseId);
  if (!row) return { ok: false, code: "not_found" };
  const { error } = await deps.sb.from(TABLE).delete().eq("id", houseId).eq("source", "floorplan");
  if (error) return { ok: false, code: "permission_denied" };
  // 戶刪掉後原圖一併刪（含上傳到一半、沒加進房間的）
  if (deps.store) for (const p of await deps.store.list(`floorplans/${houseId}/`)) await deps.store.remove(p);
  return { ok: true };
}
