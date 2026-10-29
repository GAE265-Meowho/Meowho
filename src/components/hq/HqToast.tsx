"use client";
// 成功提示（規格書 §4.7）：約 4 秒、含「查看紀錄」連結；桌機右下角、手機從底部出現（樣式見 hq.css）。
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export const HQ_TOAST_MS = 4000;
interface ToastInput { message: string; logHref?: string }
const Ctx = createContext<{ show: (t: ToastInput) => void } | null>(null);
export const useHqToast = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useHqToast must be used inside <HqToastProvider>");
  return c;
};

export function HqToastProvider({ children }: { children: React.ReactNode }) {
  const [t, setT] = useState<ToastInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((n: ToastInput) => {
    setT(n);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), HQ_TOAST_MS);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="hq-toast-region" role="status" aria-live="polite">
        {t && (
          <div className="hq-toast">
            <span>{t.message}</span>
            {t.logHref && <a href={t.logHref}>查看紀錄</a>}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
