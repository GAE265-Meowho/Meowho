// 平面圖轉換（#138）：房間改名、刪除（原圖一併刪）
import { deleteHouseRoom, renameHouseRoom } from "@/lib/hq/floorplans/core";
import { denied, fail, readBody } from "@/lib/hq/floorplans/http";
import { floorplanDeps } from "@/lib/hq/floorplans/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; roomId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const deps = await floorplanDeps();
  if (!deps) return denied();
  const body = await readBody(req);
  if (!body) return fail("invalid_body");
  const { id, roomId } = await params;
  const r = await renameHouseRoom(deps, id, roomId, body.name);
  return r.ok ? Response.json(r) : fail(r.code);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const deps = await floorplanDeps();
  if (!deps) return denied();
  const { id, roomId } = await params;
  const r = await deleteHouseRoom(deps, id, roomId);
  return r.ok ? Response.json(r) : fail(r.code);
}
