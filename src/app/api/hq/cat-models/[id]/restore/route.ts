// 改用上一版貼圖（本機模式）：目前版與上一版互換；原因必填，寫入 audit.jsonl（規格書 04 §2.3 ④、§5）
import { localRoot, restorePrevious } from "@/lib/hq/cat-models/local";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, reason_required: 400, busy: 409, no_previous: 409 };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const root = localRoot();
  if (!root) return Response.json({ error: "disabled" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  const result = await restorePrevious(root, (await params).id, String(body.reason ?? ""), "local-dev");
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
