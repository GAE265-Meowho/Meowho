// 送出生成任務：本機寫 paint_job.json、Supabase 新增 meow_cat_model_jobs，由 paint_worker.py 撿起（規格書 04 §2.3、§4）
import { repoQueuePaint } from "@/lib/hq/cat-models/repo";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, invalid_option: 400, busy: 409, views_required: 409, permission_denied: 403, disabled: 404 };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await req.json().catch(() => ({}))) as { view?: unknown; fill?: unknown; body?: unknown };
  const result = await repoQueuePaint((await params).id, body.view, body.fill, body.body);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
