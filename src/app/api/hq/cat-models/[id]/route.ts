// 單隻貓咪模型
import { isCatModelsEnabled, repoDeleteCat, repoGetCat } from "@/lib/hq/cat-models/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isCatModelsEnabled()) return Response.json({ enabled: false }, { status: 404 });
  const cat = await repoGetCat((await params).id);
  return cat ? Response.json({ enabled: true, cat }) : Response.json({ enabled: true, cat: null }, { status: 404 });
}

const STATUS: Record<string, number> = { not_found: 404, template: 409, permission_denied: 403, disabled: 404 };

/** 刪除貓咪模型：排隊或生成中也能刪；權限由 RLS（virtual_assets）把關 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await repoDeleteCat((await params).id);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
