// 貓咪的照片與貼圖：本機回檔案；bundled 導向 public/hq-cat-models
import { FILE_KINDS, type FileKind } from "@/lib/hq/cat-models/local";
import { isCatModelsEnabled, repoReadCatFile } from "@/lib/hq/cat-models/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  if (!isCatModelsEnabled()) return new Response(null, { status: 404 });
  const { id, kind } = await params;
  if (!FILE_KINDS.includes(kind as FileKind)) return new Response(null, { status: 404 });
  const file = await repoReadCatFile(id, kind as FileKind);
  if (!file) return new Response(null, { status: 404 });
  if (file.mode === "redirect") return new Response(null, { status: 302, headers: { Location: file.url } });
  return new Response(new Uint8Array(file.data), { headers: { "Content-Type": file.type, "Cache-Control": "no-cache" } });
}
