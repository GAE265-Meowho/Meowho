"use client";
// MeowHQ 閘門：未登入 → 登入頁；非管理員 → 找不到頁面；管理員 → 外殼。
// 授權資料來源（0002 執行後改接 #20 的 permissions.ts／meow_has_module）見 access.ts 與 PR 備註。
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { ADMIN_MODULES, type AdminModule } from "@/lib/hq/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { resolveGate, visibleSidebar } from "./access";
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
  const role: string | null = preview ? "system_admin" : profile?.role ?? null; // Auth.tsx 型別尚無 system_admin，以字串比對
  const state = resolveGate({ configured, loading: loading && !preview, signedIn: Boolean(user) || preview, role });
  const [grants, setGrants] = useState<AdminModule[] | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (state !== "ok" || !sb || !user) return;
    // 0002 前沒有授權表 → 查詢失敗 → grants 維持 null（示範資料：全部模組）
    sb.from("meow_admin_module_grants").select("module").eq("admin_id", user.id).then(({ data, error }) => {
      if (!error && data) setGrants(data.map(r => r.module).filter((m): m is AdminModule => (ADMIN_MODULES as readonly string[]).includes(m)));
    });
    sb.from("meow_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null).then(({ count }) => setUnread(count ?? 0));
  }, [state, user]);

  if (state === "loading") return <div className="hq-center"><HqSkeleton rows={2} /></div>;
  if (state === "login") return <HqLoginPage configured={configured} next={pathname} onLogin={() => login(window.location.pathname + window.location.search)} />;
  if (state === "not_found") return <HqNotFound />;
  return (
    <HqToastProvider>
      <HqShell
        items={visibleSidebar({ role, grants })}
        user={{ name: profile?.display_name ?? user?.email ?? "預覽", roleLabel: role === "system_admin" ? "系統管理員" : "管理員", avatarUrl: profile?.avatar_url }}
        unread={unread}
        onLogout={() => void logout()}
        activePath={pathname}
      >
        {children}
      </HqShell>
    </HqToastProvider>
  );
}
