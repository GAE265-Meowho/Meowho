// MeowHQ 前導影片的影片檔（#501、決策 006）：存 Azure Blob 私有容器 videos/trailer/。
// GET：列出每一格的所有版本，附有時效的播放與下載網址。POST：檢查後簽短效上傳網址，瀏覽器直接 PUT 到 Azure，不經過 Vercel。
// 權限繼承「影片」頁：登入且 meow_is_admin() 才可以。
import { NextResponse } from "next/server";
import {
  TRAILER_VIDEO_PREFIX, checkTrailerVideo, groupTrailerVideos, trailerVideoFileName, trailerVideoPath, videoSlotLabel,
} from "@/lib/hq/videos/trailer-video";
import { getMediaStore } from "@/lib/storage/server";
import { READ_TTL_SEC, UPLOAD_TTL_SEC } from "@/lib/storage/types";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function guard() {
  const sb = await getServerSupabase();
  const store = getMediaStore();
  if (!sb || !store) return { error: NextResponse.json({ error: "not_configured" }, { status: 503 }) };
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "login_required" }, { status: 401 }) };
  const { data: isAdmin, error } = await sb.rpc("meow_is_admin");
  if (error || !isAdmin) return { error: NextResponse.json({ error: "permission_denied" }, { status: 403 }) };
  return { store };
}

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  try {
    const grouped = groupTrailerVideos(await g.store.list(TRAILER_VIDEO_PREFIX));
    const videos: Record<string, { path: string; at: string; url: string; downloadUrl: string }[]> = {};
    for (const [slot, versions] of Object.entries(grouped)) {
      videos[slot] = await Promise.all(versions.map(async v => {
        const name = encodeURIComponent(trailerVideoFileName(slot, videoSlotLabel(slot), v));
        return {
          ...v,
          url: await g.store.readUrl(v.path, READ_TTL_SEC),
          downloadUrl: await g.store.readUrl(v.path, READ_TTL_SEC, { contentDisposition: `attachment; filename*=UTF-8''${name}` }),
        };
      }));
    }
    return NextResponse.json({ videos });
  } catch {
    return NextResponse.json({ error: "list_failed" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const g = await guard();
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => null) as { slot?: unknown; mime?: unknown; sizeBytes?: unknown } | null;
  const error = checkTrailerVideo({ slot: body?.slot, mime: body?.mime, sizeBytes: body?.sizeBytes });
  if (error) return NextResponse.json({ error }, { status: 400 });
  const path = trailerVideoPath(body!.slot as string, body!.mime as string, new Date());
  try {
    return NextResponse.json({ path, upload: await g.store.uploadUrl(path, body!.mime as string, UPLOAD_TTL_SEC) });
  } catch {
    return NextResponse.json({ error: "upload_url_failed" }, { status: 500 });
  }
}
