// 送出生成任務（本機模式）：寫 paint_job.json 為 queued，由 paint_worker.py 撿起（規格書 04 §2.3、§4）
import { localRoot, queuePaint } from "@/lib/hq/cat-models/local";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, invalid_option: 400, busy: 409 };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const root = localRoot();
  if (!root) return Response.json({ error: "disabled" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { view?: unknown; fill?: unknown };
  const result = await queuePaint(root, (await params).id, body.view, body.fill);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
