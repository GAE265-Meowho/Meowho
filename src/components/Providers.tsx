"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { resolveSiteLogo, type SiteLogo } from "@/lib/site-logo";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useAuth } from "./Auth";

interface UiCtx {
  toast: (msg: string) => void;
  /** 內建 Logo 或上傳檔案（meow_site_settings.logo） */
  logo: SiteLogo;
  /** 儲存成功後立即套用新的 Logo 設定值（不寫資料庫；寫入一律走 meow_set_site_setting） */
  applyLogo: (value: unknown) => void;
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
  const [logo, setLogoState] = useState<SiteLogo>(() => resolveSiteLogo(null));

  const toast = useCallback((m: string) => {
    setMsg(m); setShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2600);
  }, []);

  // 站台標誌：由管理員在後台設定，存在 site_settings（未設定 Supabase 時用預設）
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    sb.from("meow_site_settings").select("value").eq("key", "logo").maybeSingle().then(({ data }) => {
      if (data) setLogoState(resolveSiteLogo(data.value));
    });
  }, []);

  // 後台（/MeowHQ/admin?tab=settings）經 meow_set_site_setting 儲存成功後，呼叫這裡讓畫面立即套用
  const applyLogo = useCallback((value: unknown) => setLogoState(resolveSiteLogo(value)), []);

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
    <Ctx.Provider value={{ toast, logo, applyLogo }}>
      {children}
      <div className={`toast${show ? " show" : ""}`} role="status" aria-live="polite">{msg}</div>
    </Ctx.Provider>
  );
}
