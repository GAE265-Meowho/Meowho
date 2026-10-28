"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { LOGOS, type Logo } from "@/lib/mock-data";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useAuth } from "./Auth";

interface UiCtx {
  toast: (msg: string) => void;
  logo: Logo;
  /** 只有管理員能成功寫入（RLS 保護），回傳是否成功 */
  setLogo: (id: Logo["id"]) => Promise<boolean>;
}
const Ctx = createContext<UiCtx | null>(null);
export const useUi = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUi must be used inside <Providers>");
  return c;
};

export function Providers({ children }: { children: React.ReactNode }) {
  const { configured, user, login } = useAuth();
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [logo, setLogoState] = useState<Logo>(LOGOS[0]);

  const toast = useCallback((m: string) => {
    setMsg(m); setShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2600);
  }, []);

  // 站台標誌：由管理員在後台設定，存在 site_settings（未設定 Supabase 時用預設）
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    sb.from("site_settings").select("value").eq("key", "logo").maybeSingle().then(({ data }) => {
      const found = LOGOS.find(l => l.id === data?.value);
      if (found) setLogoState(found);
    });
  }, []);

  const setLogo = useCallback(async (id: Logo["id"]) => {
    const found = LOGOS.find(l => l.id === id) ?? LOGOS[0];
    const sb = getBrowserSupabase();
    if (!sb) { setLogoState(found); return true; }
    const { error } = await sb.from("site_settings").upsert({ key: "logo", value: found.id, updated_at: new Date().toISOString(), updated_by: user?.id });
    if (error) { toast(`儲存失敗：${error.message}`); return false; }
    setLogoState(found);
    toast(`已套用「${found.name}」`);
    return true;
  }, [toast, user]);

  // data-login：需要登入的按鈕（未登入時導向 Google 登入）；data-proto：尚未完成的功能
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const loginEl = el.closest<HTMLElement>("[data-login]");
      if (loginEl) {
        e.preventDefault();
        if (!configured) toast("登入功能尚未設定（需要 Supabase 環境變數）");
        else if (!user) void login();
        else toast(`「${loginEl.dataset.login || "這個功能"}」下一階段製作`);
        return;
      }
      const proto = el.closest<HTMLElement>("[data-proto]");
      if (proto) { e.preventDefault(); toast(`原型：「${proto.dataset.proto}」下一階段製作`); }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [toast, configured, user, login]);

  return (
    <Ctx.Provider value={{ toast, logo, setLogo }}>
      {children}
      <div className={`toast${show ? " show" : ""}`} role="status" aria-live="polite">{msg}</div>
    </Ctx.Provider>
  );
}
