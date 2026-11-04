"use client";
// 喵戶門檻（規格 09 §2）：按鈕先呼叫 pass(next)，沒登入就登入、沒有喵戶就引導建立喵戶，回來後接著做。
// 規則在 lib/household-gate.ts；資料庫（0017）也會回 household_required，畫面收到時一樣呼叫 toGuide。
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { guideUrl } from "@/lib/household-gate";
import { getBrowserSupabase } from "@/lib/supabase/client";

export function useHouseholdGate() {
  const { user, login } = useAuth();
  // undefined＝還在查；示範模式（沒有 Supabase）不擋
  const [hasHome, setHasHome] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) { setHasHome(true); return; }
    if (!user) { setHasHome(undefined); return; }
    sb.from("meow_households").select("id", { count: "exact", head: true }).eq("owner_id", user.id)
      .then(({ count }) => setHasHome((count ?? 0) > 0));
  }, [user]);

  const toGuide = useCallback((next: string) => { window.location.href = guideUrl(next); }, []);

  /** 可以做就回傳 true；否則帶去登入或建立喵戶，回傳 false */
  const pass = useCallback((next: string) => {
    if (!getBrowserSupabase()) return true;
    if (!user) { login(next); return false; }
    if (hasHome === false) { toGuide(next); return false; }
    return hasHome === true;
  }, [user, hasHome, login, toGuide]);

  return { hasHome, pass, toGuide };
}
