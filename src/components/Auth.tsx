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
  const loadProfile = useCallback(async (uid: string) => {
    if (!sb) return;
    const cols = "id, display_name, avatar_url, terms_version, role, email";
    let { data } = await sb.from("meow_profiles").select(cols).eq("id", uid).maybeSingle();
    if (!data) {
      const { data: u } = await sb.auth.getUser();
      const meta = u.user?.user_metadata ?? {};
      await sb.from("meow_profiles").insert({ id: uid, display_name: meta.full_name ?? meta.name ?? null, avatar_url: meta.avatar_url ?? null });
      ({ data } = await sb.from("meow_profiles").select(cols).eq("id", uid).maybeSingle());
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
