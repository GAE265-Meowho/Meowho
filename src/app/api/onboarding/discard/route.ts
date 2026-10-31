import { NextResponse } from "next/server";
import { getServerSupabase, requireUserForApi } from "@/lib/supabase/server";
import { PHOTO_BUCKET } from "@/lib/supabase/config";
import { getMediaStore } from "@/lib/storage/server";
import { catIdOfVideoPath } from "@/lib/storage/media";
import { canWriteCat } from "@/lib/onboarding/cat-access";

// 喵戶長放棄建檔（離開頁面、重新開始）時，清掉還沒建立貓就上傳的照片與影片（#82）。
// 瀏覽器用 sendBeacon 送出，所以不等回應；照片只能刪自己資料夾的（Storage RLS），影片會檢查是不是自己的貓。
export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok || !auth.userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const body = await req.json().catch(() => null) as { photos?: unknown; videos?: unknown } | null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 10) : []);
  const photos = list(body?.photos).filter(p => p.startsWith(`${auth.userId}/`));
  const videos = list(body?.videos);

  const sb = await getServerSupabase();
  if (sb && photos.length) await sb.storage.from(PHOTO_BUCKET).remove(photos);
  const store = getMediaStore();
  if (store) {
    for (const path of videos) {
      const catId = catIdOfVideoPath(path);
      if (catId && await canWriteCat(auth.userId, catId)) await store.remove(path);
    }
  }
  return NextResponse.json({ ok: true });
}
