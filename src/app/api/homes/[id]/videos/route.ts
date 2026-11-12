import { NextResponse } from "next/server";
import { checkHomeVideo, homeVideoPath } from "@/lib/home-room";
import { getMediaStore } from "@/lib/storage/server";
import { UPLOAD_TTL_SEC } from "@/lib/storage/types";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

// 我的 3D 房間的影片上傳網址（#273、決策 006）：確認是喵戶長本人、影片合規（#243）後，簽短效網址，
// 瀏覽器直接 PUT 到 Azure 私有容器，不經過 Vercel。上傳完再呼叫 POST /api/homes/[id]/room 建房間。
// 簽網址前先記一筆 meow_home_videos（#326）：路徑用這筆的 id，清理程式靠它刪 Azure 上的影片。
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const admin = getAdminSupabase();
  const store = getMediaStore();
  if (!sb || !admin || !store) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const { data: home } = await sb.from("meow_households").select("id").eq("id", id).eq("owner_id", auth.user.id).maybeSingle();
  if (!home) return NextResponse.json({ error: "household_not_found" }, { status: 404 });

  const body = await req.json().catch(() => null) as { mime?: unknown; sizeBytes?: unknown; durationSec?: unknown } | null;
  const error = checkHomeVideo({ mime: body?.mime, sizeBytes: body?.sizeBytes, durationSec: body?.durationSec });
  if (error) return NextResponse.json({ error }, { status: 400 });
  const mime = body!.mime as string;
  const videoId = crypto.randomUUID();
  const path = homeVideoPath(id, videoId, mime);
  const { error: dbError } = await admin.from("meow_home_videos").insert({
    id: videoId, household_id: id, path, purpose: "room", status: "uploading",
    size_bytes: body!.sizeBytes, duration_s: body!.durationSec,
  });
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  try {
    return NextResponse.json({ videoId, path, upload: await store.uploadUrl(path, mime, UPLOAD_TTL_SEC) });
  } catch {
    await admin.from("meow_home_videos").delete().eq("id", videoId);
    return NextResponse.json({ error: "upload_url_failed" }, { status: 500 });
  }
}
