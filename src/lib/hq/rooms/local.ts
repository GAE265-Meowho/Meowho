// 影片轉 3D 房間的本機模式（#93）：不連 Supabase，影片和工作都放 ROOM_LOCAL_ROOT 資料夾，3Dtest 的 pipeline/room_worker.py 領取。
// 只在開發環境啟用。每間房間一個資料夾：room.json（狀態）、source.*（影片，轉完刪除）、result/（3D 成果）。
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOM_ID_RE, checkVideo, newRoomId, videoExt, type RoomView, type VideoProblem } from "./types";

const SAFE_SEGMENT = /^[\w-][\w.-]*$/;

export function localRoomRoot(env: Record<string, string | undefined> = process.env): string | null {
  return env.NODE_ENV !== "production" && env.ROOM_LOCAL_ROOT?.trim() || null;
}

export async function writeRoom(root: string, room: RoomView): Promise<void> {
  const file = path.join(root, room.id, "room.json");
  await writeFile(`${file}.tmp`, JSON.stringify(room, null, 2));
  await rename(`${file}.tmp`, file);
}

export async function createLocalRoom(root: string, input: { name: string; type: string; data: Uint8Array }, now = new Date()): Promise<
  { ok: true; id: string } | { ok: false; code: VideoProblem | "name_required" }
> {
  const name = input.name.trim();
  if (!name || name.length > 40) return { ok: false, code: "name_required" };
  const problem = checkVideo(input.type, input.data.byteLength);
  if (problem) return { ok: false, code: problem };
  const id = newRoomId(now);
  await mkdir(path.join(root, id), { recursive: true });
  await writeFile(path.join(root, id, `source.${videoExt(input.type)}`), input.data);
  // room.json 最後才寫：worker 看到它時影片一定已經完整
  await writeRoom(root, { id, name, status: "queued", step: null, error: null, createdAt: now.toISOString(), resultBase: null });
  return { ok: true, id };
}

export async function listLocalRooms(root: string): Promise<RoomView[]> {
  await mkdir(root, { recursive: true });
  const names = (await readdir(root)).filter(n => ROOM_ID_RE.test(n));
  const rooms = await Promise.all(names.map(async n => {
    try {
      const room = JSON.parse(await readFile(path.join(root, n, "room.json"), "utf8")) as RoomView;
      return { ...room, resultBase: room.status === "ready" ? `/api/hq/rooms/local/${room.id}` : null };
    } catch {
      return null;  // 還在建立中
    }
  }));
  return rooms.filter((r): r is RoomView => r !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 成果檔的路徑；房間 ID 或檔名不合法回 null，不能讀到 result 以外的檔案 */
export function localResultPath(root: string, id: string, file: string[]): string | null {
  if (!ROOM_ID_RE.test(id) || !file.length || !file.every(s => SAFE_SEGMENT.test(s) && s !== "..")) return null;
  return path.join(root, id, "result", ...file);
}
