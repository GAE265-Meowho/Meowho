// 房間轉換工作：列表與建立（影片已由 /upload 直傳 Storage）
import { listLocalRooms, localRoomRoot } from "@/lib/hq/rooms/local";
import { createRoomJob, listRooms } from "@/lib/hq/rooms/server";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { name_required: 400, video_invalid: 400, permission_denied: 403 };

export async function GET() {
  const root = localRoomRoot();
  if (root) return Response.json({ rooms: await listLocalRooms(root) });
  const rooms = await listRooms();
  return rooms ? Response.json({ rooms }) : Response.json({ error: "permission_denied" }, { status: 403 });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const result = await createRoomJob({ id: body.id, name: body.name, path: body.path });
  return result.ok ? Response.json(result, { status: 201 }) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
