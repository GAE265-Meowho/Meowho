import { NextResponse } from "next/server";
import { guideUrl, needsGuide, safeNext } from "@/lib/household-gate";
import { getServerSupabase } from "@/lib/supabase/server";

// Google 登入完成後回到這裡，換取 session 再導回原頁。還沒有喵戶的先引導建立喵戶，建好後再回原頁（規格 09 §7.1）
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const sb = await getServerSupabase();
  if (code && sb) {
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      const { count } = await sb.from("meow_households").select("id", { count: "exact", head: true }).eq("owner_id", data.user.id);
      return NextResponse.redirect(`${origin}${needsGuide({ homes: count ?? 0, next }) ? guideUrl(next) : next}`);
    }
  }
  return NextResponse.redirect(`${origin}/?login_error=1`);
}
