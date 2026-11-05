import { createCategory, deleteCategory, listCategories } from "@/lib/hq/items/server";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  category_name_required: 400, category_in_use: 409, not_found: 404, permission_denied: 403,
};

export async function GET() {
  const categories = await listCategories();
  if (!categories) return Response.json({ error: "permission_denied" }, { status: 403 });
  return Response.json({ categories });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const result = await createCategory(body.name);
  return result.ok
    ? Response.json(result)
    : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const result = await deleteCategory(id);
  return result.ok
    ? Response.json(result)
    : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
