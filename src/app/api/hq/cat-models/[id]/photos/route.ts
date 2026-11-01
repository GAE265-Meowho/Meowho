// 補傳正面／背部花紋照（#107）：本機帶 data URL（photo）；Supabase 先用 /upload（帶 id、view）直傳，再帶 path 來記錄
import { repoAddExtraPhoto } from "@/lib/hq/cat-models/repo";
import { MAX_PHOTO_BYTES } from "@/lib/hq/cat-models/types";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, invalid_option: 400, photo_invalid: 400, photo_too_large: 413, permission_denied: 403, disabled: 404 };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES * 1.5) return Response.json({ error: "photo_too_large" }, { status: 413 });
  const body = (await req.json().catch(() => ({}))) as { view?: unknown; photo?: unknown; path?: unknown };
  const result = await repoAddExtraPhoto((await params).id, { view: body.view, photo: body.photo, path: body.path });
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
