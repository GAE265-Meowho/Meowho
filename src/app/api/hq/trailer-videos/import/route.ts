// 從 ElevenLabs 匯入旁白音檔（#575）：ElevenLabs 檔案網址沒有 CORS，瀏覽器無法直接搬，改由伺服器抓取後存進 Azure（決策 006）。
// 權限同影片頁（meow_is_admin）；只接受旁白格（n01–nNN）與 https://elevenlabsusercontent.com/ 的網址，避免成為任意抓取代理。
import { NextResponse } from "next/server";
import { trailerVideoPath, videoSlots } from "@/lib/hq/videos/trailer-video";
import { getMediaStore } from "@/lib/storage/server";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGIN = "https://elevenlabsusercontent.com";
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const store = getMediaStore();
  if (!sb || !store) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const { data: isAdmin, error } = await sb.rpc("meow_is_admin");
  if (error || !isAdmin) return NextResponse.json({ error: "permission_denied" }, { status: 403 });

  const body = await req.json().catch(() => null) as { slot?: unknown; url?: unknown } | null;
  const slot = typeof body?.slot === "string" ? body.slot : "";
  const url = typeof body?.url === "string" ? body.url : "";
  let parsed: URL | null = null;
  try { parsed = new URL(url); } catch { parsed = null; }
  const isVoice = videoSlots().some(s => s.kind === "voice" && s.id === slot);
  if (!isVoice || !parsed || parsed.origin !== ALLOWED_ORIGIN) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const res = await fetch(parsed, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const path = trailerVideoPath(slot, "audio/mpeg", new Date());
  try {
    await store.put(path, bytes, "audio/mpeg");
  } catch {
    return NextResponse.json({ error: "save_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, path });
}
