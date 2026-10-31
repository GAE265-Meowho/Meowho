"use client";
// MeowHQ 閘門：未登入 → 登入頁；非管理員 → 找不到頁面；管理員 → 外殼。
// 角色來自 meow_profiles.role，授權來自 meow_admin_module_grants（RLS：只讀得到自己的列；系統管理員讀全部）。
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/Auth";
import type { HqActor } from "@/lib/hq/permissions";
import { ADMIN_MODULES, type AdminModule } from "@/lib/hq/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { resolveGate, visibleSidebar } from "./access";
import { HqActorContext } from "./HqActor";
import { HqLoginPage, HqNotFound } from "./HqLoginPage";
import { HqShell } from "./HqShell";
import { HqSkeleton } from "./HqStates";
import { HqToastProvider } from "./HqToast";

// 本機沒設定 Supabase 時，加上 ?hqPreview=1 可預覽外殼（只在非 production；不連資料庫）
const previewWanted = () => process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).has("hqPreview");

export function HqGate({ children }: { children: React.ReactNode }) {
  const { configured, loading, user, profile, login, logout } = useAuth();
  const pathname = usePathname() ?? "/MeowHQ";
  const [wantPreview, setWantPreview] = useState(false);
  useEffect(() => setWantPreview(previewWanted()), []); // 掛載後才讀網址，避免 hydration 不一致
  const preview = !configured && wantPreview;
  const role: string | null = preview ? "system_admin" : profile?.role ?? null;
  const state = resolveGate({ configured, loading: loading && !preview, signedIn: Boolean(user) || preview, role });
  const [grants, setGrants] = useState<AdminModule[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (preview) { setGrants([]); return; }
    const sb = getBrowserSupabase();
    if (state !== "ok" || !sb || !user) return;
    sb.from("meow_admin_module_grants").select("module").eq("admin_id", user.id).then(({ data, error }) => {
      setGrants(error || !data ? [] : data.map(r => r.module).filter((m): m is AdminModule => (ADMIN_MODULES as readonly string[]).includes(m)));
    });
    sb.from("meow_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null).then(({ count }) => setUnread(count ?? 0));
  }, [state, user, preview, tick]);

  const actor: HqActor | null = useMemo(
    () => (grants === null || (role !== "admin" && role !== "system_admin") ? null : { role, modules: grants }),
    [grants, role],
  );

  if (state === "loading") return <div className="hq-center"><HqSkeleton rows={2} /></div>;
  if (state === "login") return <HqLoginPage configured={configured} next={pathname} onLogin={() => login(window.location.pathname + window.location.search)} />;
  if (state === "not_found") return <HqNotFound />;
  return (
    <HqActorContext.Provider value={{ actor, userId: preview ? "preview" : user?.id ?? null, email: profile?.email ?? null, preview, reload }}>
      <HqToastProvider>
        <HqShell
          items={visibleSidebar({ role, grants })}
          user={{ name: profile?.display_name ?? user?.email ?? "預覽", roleLabel: role === "system_admin" ? "系統管理員" : "管理員", avatarUrl: profile?.avatar_url ?? user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture }}
          unread={unread}
          userId={preview ? null : user?.id ?? null}
          onNotificationsChanged={reload}
          onLogout={() => void logout()}
          activePath={pathname}
        >
          {children}
        </HqShell>
      </HqToastProvider>
    </HqActorContext.Provider>
  );
}
