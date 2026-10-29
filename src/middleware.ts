import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hqRedirectTarget } from "@/components/hq/access";

// 每次請求更新 Supabase 登入 session（Supabase 未設定時直接放行）
export async function middleware(request: NextRequest) {
  // MeowHQ：/meowhq 等大小寫不同的寫法永久導向 /MeowHQ（保留子路徑與參數）
  const hq = hqRedirectTarget(request.nextUrl.pathname, request.nextUrl.search);
  if (hq) return NextResponse.redirect(new URL(hq, request.url), 308);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: list => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logos/|photos/).*)"],
};
