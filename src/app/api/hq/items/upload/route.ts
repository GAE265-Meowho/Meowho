import { createItemUpload } from "@/lib/hq/items/server";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { file_invalid: 400, file_too_large: 413, permission_denied: 403 };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { type?: unknown; size?: unknown };
  const result = await createItemUpload(body.type, body.size);
  return result.ok
    ? Response.json(result)
    : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
