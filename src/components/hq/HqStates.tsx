"use client";
// 空白、篩選無結果、載入（骨架）、載入失敗、離線橫幅、儲存按鈕（規格書 §4.7、§4.10）。
import { useEffect, useState } from "react";
import { hqErrorMessage } from "./errors";

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export function SleepingCat() {
  return (
    <svg className="hq-cat" role="img" aria-label="睡著的貓" viewBox="0 0 120 70" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 56h96" />
      <path d="M22 56c-2-18 10-30 30-30 22 0 40 8 46 30" />
      <path d="M30 34 28 18l12 8M52 26l8-12 4 14" />
      <path d="M38 42q4 3 8 0M98 56q10-4 8-14" />
      <path d="M74 14h10l-10 8h10M92 6h7l-7 6h7" strokeWidth="1.5" />
    </svg>
  );
}

export function HqEmptyState({ message, actionLabel, onAction }: { message: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="hq-state">
      <SleepingCat />
      <p>{message}</p>
      <button className="hq-btn" onClick={onAction}>{actionLabel}</button>
    </div>
  );
}

export function HqNoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="hq-state">
      <p>沒有符合條件的資料</p>
      <button className="hq-btn ghost" onClick={onClear}>清除篩選</button>
    </div>
  );
}

/** 載入中：骨架；超過 1 秒仍未完成，上方出現小貓掌印（CSS 動畫延遲 1 秒顯示） */
export function HqSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="hq-skeleton" role="status" aria-label="載入中">
      <svg className="hq-paw" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="16" rx="4.5" ry="3.5" /><circle cx="5.5" cy="11" r="1.7" /><circle cx="9.5" cy="6.5" r="1.7" /><circle cx="14.5" cy="6.5" r="1.7" /><circle cx="18.5" cy="11" r="1.7" />
      </svg>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="hq-bar" />)}
    </div>
  );
}

export function HqLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="hq-state" role="alert">
      <p>載入失敗</p>
      <button className="hq-btn ghost" onClick={onRetry}>重試</button>
    </div>
  );
}

export function HqOfflineBanner() {
  const online = useOnline();
  return online ? null : <div className="hq-offline" role="status">目前離線，恢復連線後會自動更新</div>;
}

/** 儲存按鈕：失敗時保留表單、在按鈕旁以白話顯示原因；離線時停用。onSave 拋出帶 code 的錯誤即可。 */
export function HqSaveButton({ onSave, disabled, children }: { onSave: () => Promise<void>; disabled?: boolean; children: React.ReactNode }) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function click() {
    setBusy(true); setError(null);
    try { await onSave(); } catch (e) { setError(hqErrorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <span className="hq-save">
      <button className="hq-btn" onClick={click} disabled={disabled || busy || !online}>{children}</button>
      {error && <span className="hq-error" role="alert">{error}</span>}
    </span>
  );
}
