// 影片轉 3D 房間（#93）：寫入一律用登入者 session，讓 RLS 的 virtual_assets 權限把關。
// 影片由瀏覽器直傳私有 bucket，避開 Vercel 約 4.5 MB 的請求上限；轉換由本機 worker 領 meow_room_jobs。
import "server-only";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";
import { RESULT_BUCKET, ROOM_ID_RE, VIDEO_BUCKET, checkVideo, cleanNote, newRoomId, videoExt, type RoomStatus, type RoomView, type VideoProblem } from "./types";

async function userClient() {
  const sb = await getServerSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ? { sb, userId: data.user.id } : null;
}

export type UploadTicket = { ok: true; id: string; bucket: string; path: string; token: string };

export async function createVideoUpload(type: unknown, size: unknown, now = new Date()): Promise<
  UploadTicket | { ok: false; code: VideoProblem | "permission_denied" }
> {
  const problem = checkVideo(type, size);
  if (problem) return { ok: false, code: problem };
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const id = newRoomId(now);
  const path = `${id}/source.${videoExt(type)}`;
  const { data, error } = await user.sb.storage.from(VIDEO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, code: "permission_denied" };
  return { ok: true, id, bucket: VIDEO_BUCKET, path, token: data.token };
}

export async function createRoomJob(input: { id: unknown; name: unknown; path: unknown; note?: unknown }): Promise<
  { ok: true; id: string } | { ok: false; code: "name_required" | "note_too_long" | "video_invalid" | "permission_denied" }
> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 40) return { ok: false, code: "name_required" };
  const note = cleanNote(input.note);
  if (note === undefined) return { ok: false, code: "note_too_long" };
  const { id, path } = input;
  if (typeof id !== "string" || !ROOM_ID_RE.test(id) || typeof path !== "string" || !path.startsWith(`${id}/source.`)) {
    return { ok: false, code: "video_invalid" };
  }
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const { error } = await user.sb.from("meow_room_models").insert({ id, name, status: "queued", video_path: path, created_by: user.userId, meta: note ? { note } : {} });
  if (error) {
    await user.sb.storage.from(VIDEO_BUCKET).remove([path]);  // 沒建立成工作的影片不留著（決策 007）
    return { ok: false, code: "permission_denied" };
  }
  const job = await user.sb.from("meow_room_jobs").insert({ room_id: id, status: "queued" });
  if (job.error) {
    await user.sb.from("meow_room_models").delete().eq("id", id);
    await user.sb.storage.from(VIDEO_BUCKET).remove([path]);
    return { ok: false, code: "permission_denied" };
  }
  return { ok: true, id };
}

interface RoomRow {
  id: string;
  name: string;
  status: RoomStatus;
  result_path: string | null;
  meta: { note?: unknown; thumb?: unknown } | null;
  created_by: string | null;
  creator: { display_name: string | null; email: string | null } | null;
  created_at: string;
  updated_at: string;
  meow_room_jobs: { step: string | null; error: string | null; queued_at: string; started_at: string | null; finished_at: string | null }[] | null;
}

const SAFE_FILE = /^[\w-][\w.-]*$/;

export function toRoomView(row: RoomRow): RoomView {
  const job = [...(row.meow_room_jobs ?? [])].sort((a, b) => b.queued_at.localeCompare(a.queued_at))[0];
  const resultBase = row.status === "ready" && row.result_path
    ? `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${RESULT_BUCKET}/${row.result_path}`
    : null;
  const thumb = row.meta?.thumb;
  return {
    id: row.id, name: row.name, status: row.status, step: job?.step ?? null, error: job?.error ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at, resultBase,
    note: typeof row.meta?.note === "string" ? row.meta.note : null,
    // 和貓咪列表一樣：沒有 created_by 的是直接放進來的示範資料；讀不到個人資料時為 null
    createdBy: row.created_by ? row.creator?.display_name || row.creator?.email || null : "系統",
    thumbUrl: resultBase && typeof thumb === "string" && SAFE_FILE.test(thumb) ? `${resultBase}/${thumb}` : null,
    startedAt: job?.started_at ?? null, finishedAt: job?.finished_at ?? null,
  };
}

export async function listRooms(): Promise<RoomView[] | null> {
  const user = await userClient();
  if (!user) return null;
  const { data, error } = await user.sb.from("meow_room_models")
    .select("id,name,status,result_path,meta,created_by,created_at,updated_at,creator:meow_profiles!created_by(display_name,email),meow_room_jobs(step,error,queued_at,started_at,finished_at)")
    .eq("source", "video")  // 平面圖的戶（#138，0015）不列在影片轉換
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return null;
  return (data as unknown as RoomRow[]).map(toRoomView);
}
