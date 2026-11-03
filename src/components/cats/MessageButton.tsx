"use client";
// 貓咪頁「傳訊息給喵戶長」（#70，#128）：開啟或沿用（會員 × 貓）的對話串，再到「領養管理」的那一串
// 要先登入、有喵戶（規格 09 §2）；從登入或建立喵戶回來（?do=msg）自動接著開
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/Auth";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { useHouseholdGate } from "@/components/useHouseholdGate";
import { takeIntent, withIntent } from "@/lib/household-gate";
import { getBrowserSupabase } from "@/lib/supabase/client";

const ERRORS: Record<string, string> = {
  thread_closed: "這個喵戶目前不接受私訊，可以先填寫領養問卷。",
  thread_blocked: "你們之間有封鎖設定，無法傳訊息。",
  thread_not_adoptable: "這隻貓目前沒有在等家。",
  message_suspended: "帳號目前無法傳送訊息。",
};

export function MessageButton({ catId }: { catId: string }) {
  const { user } = useAuth();
  const { hasHome, pass, toGuide } = useHouseholdGate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resumed = useRef(false);
  const back = () => withIntent(`/cats/${catId}`, "msg");

  async function open() {
    const sb = getBrowserSupabase();
    if (!sb) return;
    setBusy(true); setError(null);
    const { data, error: err } = await sb.rpc("meow_open_thread", { p_cat_id: catId });
    setBusy(false);
    if (err) {
      if (err.message.includes("household_required")) { toGuide(back()); return; }
      setError(Object.entries(ERRORS).find(([k]) => err.message.includes(k))?.[1] ?? `開啟失敗：${err.message}`);
      return;
    }
    window.location.href = `/me/adoptions?t=${data}`;
  }

  useEffect(() => {
    if (resumed.current || !user || hasHome !== true) return;
    const { intent, clean } = takeIntent(window.location.href);
    if (intent !== "msg") return;
    resumed.current = true;
    window.history.replaceState(null, "", clean);
    open();
  }, [user, hasHome]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <CatButton variant="ghost" ears={false} disabled={busy} onClick={() => { if (pass(back())) open(); }}>
        <Icon name="comment" size={18} />{busy ? "開啟中…" : "傳訊息給喵戶長"}
      </CatButton>
      {error && <p className={f.error} role="alert">{error}</p>}
    </>
  );
}
