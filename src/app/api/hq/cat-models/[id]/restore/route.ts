// 改用上一版貼圖：目前版與上一版互換；原因必填並寫稽核（本機 audit.jsonl、Supabase meow_audit_logs）（規格書 04 §2.3 ④、§5）
import { repoRestore } from "@/lib/hq/cat-models/repo";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, reason_required: 400, busy: 409, no_previous: 409, permission_denied: 403, disabled: 404 };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown; body?: unknown };
  const result = await repoRestore((await params).id, String(body.reason ?? ""), "local-dev", body.body);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
