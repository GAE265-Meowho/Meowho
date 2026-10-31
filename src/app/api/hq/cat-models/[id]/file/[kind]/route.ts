// 貓咪的照片與貼圖（本機模式）：kind 只允許 photo、albedo、albedo_prev
import { FILE_KINDS, localRoot, readCatFile, type FileKind } from "@/lib/hq/cat-models/local";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const root = localRoot();
  if (!root) return new Response(null, { status: 404 });
  const { id, kind } = await params;
  if (!FILE_KINDS.includes(kind as FileKind)) return new Response(null, { status: 404 });
  const file = await readCatFile(root, id, kind as FileKind);
  if (!file) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(file.data), { headers: { "Content-Type": file.type, "Cache-Control": "no-cache" } });
}
