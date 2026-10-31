// 上架／下架：本機寫 publication.json；Supabase 走 meow_publish_cat_model（規格書 04 §5）
import { isCatModelsEnabled, repoPublish, resolveCatSource } from "@/lib/hq/cat-models/repo";
import { requireUserForApi } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  not_found: 404,
  reason_required: 400,
  invalid_state: 409,
  permission_denied: 403,
  disabled: 404,
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isCatModelsEnabled()) return Response.json({ error: "disabled" }, { status: 404 });
  const src = resolveCatSource();
  if (src !== "local" && src !== "supabase") return Response.json({ error: "disabled" }, { status: 404 });

  let actor = "local-dev";
  if (src === "supabase") {
    const auth = await requireUserForApi();
    if (!auth.ok || !auth.userId) return Response.json({ error: "permission_denied" }, { status: 403 });
    actor = auth.userId;
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string };
  if (body.action !== "publish" && body.action !== "unpublish") return Response.json({ error: "invalid_action" }, { status: 400 });
  const result = await repoPublish((await params).id, body.action, String(body.reason ?? ""), actor);
  return result.ok
    ? Response.json({ ok: true, status: result.status })
    : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
