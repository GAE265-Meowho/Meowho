// 貓咪模型列表與新增（本機模式，規格書 04 §4）：只在開發模式且設了 CAT_STUDIO_ROOT 時有回應，其餘一律 404。
import { createCat, listCats, localRoot } from "@/lib/hq/cat-models/local";
import { MAX_PHOTO_BYTES } from "@/lib/hq/cat-models/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const root = localRoot();
  if (!root) return Response.json({ enabled: false }, { status: 404 });
  return Response.json({ enabled: true, cats: await listCats(root) });
}

const STATUS: Record<string, number> = { name_required: 400, photo_invalid: 400, photo_too_large: 413 };

/** 新增貓咪：JSON { name, ageMonths?, weightKg?, notes?, photo: dataURL }；只建草稿，不會自動開始生成 */
export async function POST(req: Request) {
  const root = localRoot();
  if (!root) return Response.json({ error: "disabled" }, { status: 404 });
  // base64 會比原檔大約 4/3，先用標頭擋掉明顯過大的請求
  if (Number(req.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES * 1.5) return Response.json({ error: "photo_too_large" }, { status: 413 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  const result = await createCat(root, { name: String(body.name ?? ""), ageMonths: body.ageMonths, weightKg: body.weightKg, notes: body.notes, photo: body.photo });
  return result.ok ? Response.json({ ok: true, id: result.id }, { status: 201 }) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
