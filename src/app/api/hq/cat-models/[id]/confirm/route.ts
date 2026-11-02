// 確認使用目前的紋理貼圖（#129）：確認後才能進第 4 步，貓咪頁改用這張；寫稽核 confirm_texture
import { repoConfirmTexture } from "@/lib/hq/cat-models/repo";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, busy: 409, no_texture: 409, permission_denied: 403, disabled: 404 };

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await repoConfirmTexture((await params).id);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
