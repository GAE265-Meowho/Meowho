// 上架／下架（本機模式）：原因必填，寫入 publication.json 與 audit.jsonl（規格書 04 §5）
import { localRoot, setPublication } from "@/lib/hq/cat-models/local";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, reason_required: 400, invalid_state: 409 };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const root = localRoot();
  if (!root) return Response.json({ error: "disabled" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string };
  if (body.action !== "publish" && body.action !== "unpublish") return Response.json({ error: "invalid_action" }, { status: 400 });
  const result = await setPublication(root, (await params).id, body.action, String(body.reason ?? ""), "local-dev");
  return result.ok ? Response.json({ ok: true, status: result.status }) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
