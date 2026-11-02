// 平面圖轉換（#138）：一戶的清單與新增
import { createHouse, listHouses } from "@/lib/hq/floorplans/core";
import { denied, fail, readBody } from "@/lib/hq/floorplans/http";
import { floorplanDeps } from "@/lib/hq/floorplans/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const deps = await floorplanDeps();
  if (!deps) return denied();
  const r = await listHouses(deps);
  return r.ok ? Response.json({ houses: r.houses, storage: !!deps.store }) : fail(r.code);
}

export async function POST(req: Request) {
  const deps = await floorplanDeps();
  if (!deps) return denied();
  const body = await readBody(req);
  if (!body) return fail("invalid_body");
  const r = await createHouse(deps, body.name);
  return r.ok ? Response.json(r, { status: 201 }) : fail(r.code);
}
