"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { LOGOS, type Logo } from "@/lib/mock-data";
import { useAuth } from "./Auth";

interface UiCtx {
  toast: (msg: string) => void;
  logo: Logo;
  setLogo: (id: Logo["id"]) => void;
  openAdmin: () => void;
  adminOpen: boolean;
  closeAdmin: () => void;
}
const Ctx = createContext<UiCtx | null>(null);
export const useUi = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUi must be used inside <Providers>");
  return c;
};

const LOGO_KEY = "mh.logo";

export function Providers({ children }: { children: React.ReactNode }) {
  const { configured, user, login } = useAuth();
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [logo, setLogoState] = useState<Logo>(LOGOS[0]);
  const [adminOpen, setAdminOpen] = useState(false);

  const toast = useCallback((m: string) => {
    setMsg(m); setShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2400);
  }, []);

  // 原型階段：管理者選擇的標誌存在瀏覽器；正式版改存 Supabase site_settings（見 tickets）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOGO_KEY);
      const found = LOGOS.find(l => l.id === saved);
      if (found) setLogoState(found);
    } catch { /* 無法使用 localStorage 時使用預設 */ }
    if (/[?&]admin/.test(window.location.search)) setAdminOpen(true);
  }, []);

  const setLogo = useCallback((id: Logo["id"]) => {
    const found = LOGOS.find(l => l.id === id) ?? LOGOS[0];
    setLogoState(found);
    try { localStorage.setItem(LOGO_KEY, found.id); } catch { /* ignore */ }
    toast(`已套用「${found.name}」`);
  }, [toast]);

  // 原型中尚未實作的按鈕：data-login / data-proto 統一提示
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const login = el.closest("[data-login]");
      if (login) {
        e.preventDefault();
        if (!configured) toast("登入功能尚未設定（需要 Supabase 環境變數）");
        else if (!user) void doLogin();
        else toast(`「${(login as HTMLElement).dataset.login || "這個功能"}」下一階段製作`);
        return;
      }
      const proto = el.closest<HTMLElement>("[data-proto]");
      if (proto) { e.preventDefault(); toast(`原型：「${proto.dataset.proto}」下一階段製作`); }
    };
    const doLogin = () => login();
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [toast, configured, user, login]);

  return (
    <Ctx.Provider value={{ toast, logo, setLogo, adminOpen, openAdmin: () => setAdminOpen(true), closeAdmin: () => setAdminOpen(false) }}>
      {children}
      <div className={`toast${show ? " show" : ""}`} role="status" aria-live="polite">{msg}</div>
    </Ctx.Provider>
  );
}
