// 平面圖轉換（#138，規格 §5）：AI 讀圖／重新讀圖。body { houseId, roomId }。
// 立刻回 202，讀圖（約 20～60 秒）在背景執行；畫面輪詢 /api/hq/floorplans/<戶> 看房間狀態。
import { denied, fail, readBody } from "@/lib/hq/floorplans/http";
import { floorplanDeps, scheduleRoomRead } from "@/lib/hq/floorplans/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const deps = await floorplanDeps();
  if (!deps) return denied();
  const body = await readBody(req);
  if (!body || typeof body.houseId !== "string") return fail("invalid_body");
  const r = await scheduleRoomRead(deps, body.houseId, body.roomId);
  return r.ok ? Response.json({ ok: true }, { status: 202 }) : fail(r.code);
}
