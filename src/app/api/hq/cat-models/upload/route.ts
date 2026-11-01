// 新增貓咪第一步：本機回 inline（照片跟表單一起送）；Supabase 檢查格式與大小後簽一個上傳網址，瀏覽器直傳照片
import { repoPhotoUpload } from "@/lib/hq/cat-models/repo";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { photo_invalid: 400, photo_too_large: 413, permission_denied: 403, disabled: 404 };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { type?: unknown; size?: unknown; id?: unknown; view?: unknown };
  // 帶 view（#105）：同一隻貓的正面／背部花紋照
  const result = await repoPhotoUpload(body.type, body.size, body.view === undefined ? undefined : { id: body.id, view: body.view });
  return result.ok ? Response.json(result) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
