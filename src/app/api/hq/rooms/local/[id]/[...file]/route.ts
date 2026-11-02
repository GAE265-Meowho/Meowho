// 本機模式讀取轉換成果，給檢視器用
import { readFile } from "node:fs/promises";
import { localResultPath, localRoomRoot } from "@/lib/hq/rooms/local";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; file: string[] }> }) {
  const root = localRoomRoot();
  const { id, file } = await params;
  const target = root && localResultPath(root, id, file);
  if (!target) return new Response(null, { status: 404 });
  const data = await readFile(target).catch(() => null);
  if (!data) return new Response(null, { status: 404 });
  const type = target.endsWith(".json") ? "application/json" : "application/octet-stream";
  return new Response(new Uint8Array(data), { headers: { "Content-Type": type } });
}
