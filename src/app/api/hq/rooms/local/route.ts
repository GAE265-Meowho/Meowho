// 本機模式建立房間：影片直接放在請求內容，房間名稱和備註放網址參數
import { createLocalRoom, localRoomRoot } from "@/lib/hq/rooms/local";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const root = localRoomRoot();
  if (!root) return Response.json({ error: "disabled" }, { status: 404 });
  const params = new URL(req.url).searchParams;
  const result = await createLocalRoom(root, {
    name: params.get("name") ?? "",
    note: params.get("note"),
    type: req.headers.get("content-type") ?? "",
    data: new Uint8Array(await req.arrayBuffer()),
  });
  return result.ok ? Response.json(result, { status: 201 }) : Response.json({ error: result.code }, { status: 400 });
}
