// 貓咪模型列表與新增：本機（CAT_STUDIO_ROOT）或正式站靜態示範貓（bundled）
import { isCatModelsEnabled, repoCreateCat, repoListCats } from "@/lib/hq/cat-models/repo";
import { MAX_PHOTO_BYTES } from "@/lib/hq/cat-models/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isCatModelsEnabled()) return Response.json({ enabled: false }, { status: 404 });
  return Response.json({ enabled: true, cats: await repoListCats() });
}

const STATUS: Record<string, number> = { name_required: 400, photo_invalid: 400, photo_too_large: 413, disabled: 404 };

/** 新增貓咪：只在本機模式；正式站示範目錄唯讀 */
export async function POST(req: Request) {
  if (!isCatModelsEnabled()) return Response.json({ error: "disabled" }, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES * 1.5) return Response.json({ error: "photo_too_large" }, { status: 413 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const result = await repoCreateCat({ name: String(body.name ?? ""), ageMonths: body.ageMonths, weightKg: body.weightKg, notes: body.notes, photo: body.photo });
  return result.ok ? Response.json({ ok: true, id: result.id }, { status: 201 }) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
