import { NextResponse } from "next/server";
import { checkHomeVideo, homeVideoPath } from "@/lib/home-room";
import { getMediaStore } from "@/lib/storage/server";
import { UPLOAD_TTL_SEC } from "@/lib/storage/types";
import { getServerSupabase } from "@/lib/supabase/server";

// 我的 3D 房間的影片上傳網址（#273、決策 006）：確認是喵戶長本人、影片合規（#243）後，簽短效網址，
// 瀏覽器直接 PUT 到 Azure 私有容器，不經過 Vercel。上傳完再呼叫 POST /api/homes/[id]/room 建房間。
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const store = getMediaStore();
  if (!sb || !store) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const { data: home } = await sb.from("meow_households").select("id").eq("id", id).eq("owner_id", auth.user.id).maybeSingle();
  if (!home) return NextResponse.json({ error: "household_not_found" }, { status: 404 });

  const body = await req.json().catch(() => null) as { mime?: unknown; sizeBytes?: unknown; durationSec?: unknown } | null;
  const error = checkHomeVideo({ mime: body?.mime, sizeBytes: body?.sizeBytes, durationSec: body?.durationSec });
  if (error) return NextResponse.json({ error }, { status: 400 });
  const path = homeVideoPath(id, crypto.randomUUID(), body!.mime as string);
  return NextResponse.json({ path, upload: await store.uploadUrl(path, body!.mime as string, UPLOAD_TTL_SEC) });
}
