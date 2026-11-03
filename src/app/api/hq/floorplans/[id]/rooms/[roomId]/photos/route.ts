// 平面圖轉換：同一間房的其他角度實景照片（#144，加主圖最多 4 張）。兩步——
//   POST { type, size }   → 回傳 Azure 上傳網址（瀏覽器直接 PUT）
//   POST { path }         → 確認已上傳、加進房間，並自動重新讀圖
//   DELETE { path }       → 移除一張（不會自動重新讀圖，由管理員按「重新讀圖」）
import { addRoomPhoto, createPhotoUpload, removeRoomPhoto } from "@/lib/hq/floorplans/core";
import { denied, fail, readBody } from "@/lib/hq/floorplans/http";
import { floorplanDeps, scheduleRoomRead } from "@/lib/hq/floorplans/server";

export const dynamic = "force-dynamic";
// 讀圖在 after() 背景執行，同一個函式的時間上限要夠
export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string; roomId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const deps = await floorplanDeps();
  if (!deps) return denied();
  const body = await readBody(req);
  if (!body) return fail("invalid_body");
  const { id, roomId } = await params;
  if ("path" in body) {
    const r = await addRoomPhoto(deps, id, roomId, body.path);
    if (!r.ok) return fail(r.code);
    const read = await scheduleRoomRead(deps, id, roomId);
    return Response.json({ ok: true, reading: read.ok }, { status: 201 });
  }
  const r = await createPhotoUpload(deps, id, roomId, body.type, body.size);
  return r.ok ? Response.json(r) : fail(r.code);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const deps = await floorplanDeps();
  if (!deps) return denied();
  const body = await readBody(req);
  if (!body) return fail("invalid_body");
  const { id, roomId } = await params;
  const r = await removeRoomPhoto(deps, id, roomId, body.path);
  return r.ok ? Response.json(r) : fail(r.code);
}
