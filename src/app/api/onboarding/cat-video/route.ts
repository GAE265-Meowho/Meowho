import { NextResponse } from "next/server";
import { requireUserForApi } from "@/lib/supabase/server";
import { getMediaStore } from "@/lib/storage/server";
import { catIdOfVideoPath, prepareCatVideoUpload } from "@/lib/storage/media";
import { canWriteCat } from "@/lib/onboarding/cat-access";

// 簽發貓影片的上傳網址（#72、決策 006）：瀏覽器拿到後直接傳到 Azure，不經過 Vercel。
// 已有幾支以雲端實際檔案為準，不相信瀏覽器傳來的數字。
export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const store = getMediaStore();
  if (!store) return NextResponse.json({ error: "video_disabled" }, { status: 503 });
  const body = await req.json().catch(() => null) as { catId?: string; mime?: string; sizeBytes?: number; durationSec?: number } | null;
  const { catId, mime, sizeBytes, durationSec } = body ?? {};
  if (typeof catId !== "string" || !/^[0-9a-f-]{36}$/.test(catId) || typeof mime !== "string" || typeof sizeBytes !== "number" || typeof durationSec !== "number") {
    return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  }
  if (!(await canWriteCat(auth.userId, catId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const existingCount = (await store.list(`cats/${catId}/videos/`)).length;
  const r = await prepareCatVideoUpload(store, { catId, mime, sizeBytes, durationSec, existingCount });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ path: r.path, upload: r.upload });
}

// 喵戶長在建立前移除影片：連雲端檔案一起刪
export async function DELETE(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const store = getMediaStore();
  if (!store) return NextResponse.json({ error: "video_disabled" }, { status: 503 });
  const body = await req.json().catch(() => null) as { path?: string } | null;
  const catId = typeof body?.path === "string" ? catIdOfVideoPath(body.path) : null;
  if (!catId) return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  if (!(await canWriteCat(auth.userId, catId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await store.remove(body!.path!);
  return NextResponse.json({ ok: true });
}
