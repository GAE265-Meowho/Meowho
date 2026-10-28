import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

export async function getServerSupabase() {
  if (!isSupabaseConfigured) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* 在 Server Component 中無法寫 cookie，交給 middleware */ }
      },
    },
  });
}

/** API 路由的登入檢查：Supabase 未設定（本機開發）時放行，已設定時必須登入 */
export async function requireUserForApi(): Promise<{ ok: true; userId: string | null } | { ok: false }> {
  const sb = await getServerSupabase();
  if (!sb) return { ok: true, userId: null };
  const { data } = await sb.auth.getUser();
  return data.user ? { ok: true, userId: data.user.id } : { ok: false };
}
