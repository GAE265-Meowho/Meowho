// 平面圖轉換（#138）：新增房間。兩步——
//   POST { type, size }            → 保留房間編號、回傳 Azure 上傳網址（瀏覽器直接 PUT）
//   POST { roomId, path, name }    → 確認已上傳，把房間加進這一戶
import { addUploadedRoom, createRoomUpload } from "@/lib/hq/floorplans/core";
import { denied, fail, readBody } from "@/lib/hq/floorplans/http";
import { floorplanDeps } from "@/lib/hq/floorplans/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deps = await floorplanDeps();
  if (!deps) return denied();
  const body = await readBody(req);
  if (!body) return fail("invalid_body");
  const id = (await params).id;
  if ("roomId" in body) {
    const r = await addUploadedRoom(deps, id, { roomId: body.roomId, path: body.path, name: body.name });
    return r.ok ? Response.json(r, { status: 201 }) : fail(r.code);
  }
  const r = await createRoomUpload(deps, id, body.type, body.size);
  return r.ok ? Response.json(r) : fail(r.code);
}
