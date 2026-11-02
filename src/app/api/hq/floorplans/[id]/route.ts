// 平面圖轉換（#138）：一戶的內容（房間＋原圖預覽網址）與刪除
import { deleteHouse, getHouse } from "@/lib/hq/floorplans/core";
import { denied, fail } from "@/lib/hq/floorplans/http";
import { floorplanDeps } from "@/lib/hq/floorplans/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const deps = await floorplanDeps();
  if (!deps) return denied();
  const house = await getHouse(deps, (await params).id);
  return house ? Response.json({ house, storage: !!deps.store }) : fail("not_found");
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const deps = await floorplanDeps();
  if (!deps) return denied();
  const r = await deleteHouse(deps, (await params).id);
  return r.ok ? Response.json(r) : fail(r.code);
}
