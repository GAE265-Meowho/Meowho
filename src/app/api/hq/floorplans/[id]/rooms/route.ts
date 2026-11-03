// 平面圖轉換（#138）：新增房間。兩步——
//   POST { type, size }            → 保留房間編號、回傳 Azure 上傳網址（瀏覽器直接 PUT）
//   POST { roomId, path, name }    → 確認已上傳，把房間加進這一戶，並自動開始 AI 讀圖（規格 Q2；沒設定 AI 就停在「待讀圖」）
import { addUploadedRoom, createRoomUpload } from "@/lib/hq/floorplans/core";
import { denied, fail, readBody } from "@/lib/hq/floorplans/http";
import { floorplanDeps, scheduleRoomRead } from "@/lib/hq/floorplans/server";

export const dynamic = "force-dynamic";
// 讀圖在 after() 背景執行，同一個函式的時間上限要夠（規格 §5）
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deps = await floorplanDeps();
  if (!deps) return denied();
  const body = await readBody(req);
  if (!body) return fail("invalid_body");
  const id = (await params).id;
  if ("roomId" in body) {
    const r = await addUploadedRoom(deps, id, { roomId: body.roomId, path: body.path, name: body.name });
    if (!r.ok) return fail(r.code);
    const read = await scheduleRoomRead(deps, id, r.roomId);
    return Response.json({ ...r, reading: read.ok }, { status: 201 });
  }
  const r = await createRoomUpload(deps, id, body.type, body.size);
  return r.ok ? Response.json(r) : fail(r.code);
}
