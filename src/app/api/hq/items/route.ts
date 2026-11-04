import { createItem, deleteItem, listItems } from "@/lib/hq/items/server";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  file_invalid: 400, file_too_large: 413, name_required: 400, category_required: 400,
  model_invalid: 400, category_name_required: 400, category_in_use: 409,
  not_found: 404, permission_denied: 403,
};

export async function GET() {
  const items = await listItems();
  if (!items) return Response.json({ error: "permission_denied" }, { status: 403 });
  return Response.json({ items });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown; nameEn?: unknown; categoryId?: unknown; priceTwd?: unknown;
    instructions?: unknown; modelPath?: unknown; widthM?: unknown; depthM?: unknown; heightM?: unknown;
  };
  const result = await createItem({
    name: body.name, nameEn: body.nameEn, categoryId: body.categoryId, priceTwd: body.priceTwd,
    instructions: body.instructions, modelPath: body.modelPath,
    widthM: body.widthM, depthM: body.depthM, heightM: body.heightM,
  });
  return result.ok
    ? Response.json(result)
    : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const result = await deleteItem(id);
  return result.ok
    ? Response.json(result)
    : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
