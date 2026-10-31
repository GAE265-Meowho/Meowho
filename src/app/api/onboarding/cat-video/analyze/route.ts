import { NextResponse } from "next/server";
import { analyzeCatVideo } from "@/lib/ai/server";
import { MAX_INLINE_VIDEO_BYTES } from "@/lib/ai/intake";
import { requireUserForApi } from "@/lib/supabase/server";
import { getMediaStore } from "@/lib/storage/server";
import { catIdOfVideoPath } from "@/lib/storage/media";
import { contentTypeOf } from "@/lib/storage/promote";
import { canWriteCat } from "@/lib/onboarding/cat-access";

// 影片個性判讀（#72）：只是建議，畫面上一律標「請確認」。
// 超過 20 MB 或不是 Gemini 時不判讀（skipped），影片照樣保留。
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const store = getMediaStore();
  if (!store) return NextResponse.json({ error: "video_disabled" }, { status: 503 });
  const body = await req.json().catch(() => null) as { path?: string; sizeBytes?: number } | null;
  const catId = typeof body?.path === "string" ? catIdOfVideoPath(body.path) : null;
  if (!catId || typeof body?.sizeBytes !== "number") return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  if (!(await canWriteCat(auth.userId, catId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (body.sizeBytes > MAX_INLINE_VIDEO_BYTES) return NextResponse.json({ result: null, skipped: "too_large" });
  const bytes = await store.download(body.path!);
  if (!bytes) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const result = await analyzeCatVideo(contentTypeOf(body.path!), bytes);
  return NextResponse.json({ result, skipped: result ? null : "no_ai" });
}
