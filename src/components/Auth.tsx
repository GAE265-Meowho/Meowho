"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { TERMS_VERSION, isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminRole, type ProfileRole } from "@/lib/auth-role";

export interface Profile { id: string; display_name: string | null; avatar_url: string | null; terms_version: string | null; role: ProfileRole; email: string | null }
interface AuthCtx {
  configured: boolean;
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  needsTerms: boolean;
  isAdmin: boolean;
  login: (next?: string) => Promise<void>;
  logout: () => Promise<void>;
  agreeTerms: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);
export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <AuthProvider>");
  return c;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const sb = getBrowserSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  // 共用 Supabase 專案：不在 auth.users 上加 trigger，第一次登入 Meowho喵戶 時由這裡建立 profile
  // Google 大頭貼多半在 user_metadata.picture（不一定有 avatar_url）
  const loadProfile = useCallback(async (uid: string) => {
    if (!sb) return;
    const cols = "id, display_name, avatar_url, terms_version, role, email";
    const { data: auth } = await sb.auth.getUser();
    const meta = auth.user?.user_metadata ?? {};
    const googleName = (meta.full_name ?? meta.name ?? null) as string | null;
    const googleAvatar = (meta.avatar_url ?? meta.picture ?? null) as string | null;
    let { data } = await sb.from("meow_profiles").select(cols).eq("id", uid).maybeSingle();
    if (!data) {
      await sb.from("meow_profiles").insert({ id: uid, display_name: googleName, avatar_url: googleAvatar });
      ({ data } = await sb.from("meow_profiles").select(cols).eq("id", uid).maybeSingle());
    } else if (googleAvatar && data.avatar_url !== googleAvatar) {
      // 補上／更新 Google 頭像，讓 MeowHQ 右上角能辨識已登入者
      const { data: updated } = await sb.from("meow_profiles").update({ avatar_url: googleAvatar, display_name: data.display_name ?? googleName }).eq("id", uid).select(cols).maybeSingle();
      if (updated) data = updated;
      else data = { ...data, avatar_url: googleAvatar, display_name: data.display_name ?? googleName };
    }
    setProfile(data as Profile | null);
  }, [sb]);

  useEffect(() => {
    if (!sb) return;
    // 任何失敗（網路被擋、Supabase 暫停）都要結束「載入中」，否則頁面會永遠停在載入畫面
    const timer = setTimeout(() => setLoading(false), 8000);
    const done = () => { clearTimeout(timer); setLoading(false); };
    sb.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) loadProfile(data.user.id).catch(() => undefined).finally(done); else done();
    }).catch(done);
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id); else setProfile(null);
    });
    return () => { clearTimeout(timer); sub.subscription.unsubscribe(); };
  }, [sb, loadProfile]);

  const login = useCallback(async (next?: string) => {
    if (!sb) return;
    const target = next ?? window.location.pathname + window.location.search;
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}` },
    });
  }, [sb]);

  const logout = useCallback(async () => { await sb?.auth.signOut(); window.location.href = "/"; }, [sb]);

  const agreeTerms = useCallback(async () => {
    if (!sb || !user) return;
    const { error } = await sb.from("meow_profiles").update({ terms_version: TERMS_VERSION, terms_agreed_at: new Date().toISOString() }).eq("id", user.id);
    if (!error) setProfile(p => (p ? { ...p, terms_version: TERMS_VERSION } : p));
  }, [sb, user]);

  const needsTerms = Boolean(user && profile && profile.terms_version !== TERMS_VERSION);

  return (
    <Ctx.Provider value={{ configured: isSupabaseConfigured, loading, user, profile, needsTerms, isAdmin: isAdminRole(profile?.role), login, logout, agreeTerms }}>
      {children}
    </Ctx.Provider>
  );
}
