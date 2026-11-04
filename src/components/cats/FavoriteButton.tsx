"use client";
// 收藏貓咪（#70）：按一次收藏、再按一次取消。要先登入、有喵戶（規格 09 §2）；從登入或建立喵戶回來（?do=fav）自動收藏
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/Auth";
import { useHouseholdGate } from "@/components/useHouseholdGate";
import { takeIntent, withIntent } from "@/lib/household-gate";
import { getBrowserSupabase } from "@/lib/supabase/client";
import Icon from "../ui/Icon";
import s from "./catPage.module.css";

export function FavoriteButton({ catId }: { catId: string }) {
  const { user } = useAuth();
  const { hasHome, pass, toGuide } = useHouseholdGate();
  const [on, setOn] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const resumed = useRef(false);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb || !user) return;
    sb.from("meow_cat_favorites").select("cat_id").eq("cat_id", catId).eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setOn(Boolean(data)));
  }, [user, catId]);

  async function toggle(want = !on) {
    const sb = getBrowserSupabase();
    if (!sb || !user) return;
    setBusy(true);
    const { error } = want
      ? await sb.from("meow_cat_favorites").insert({ cat_id: catId, user_id: user.id })
      : await sb.from("meow_cat_favorites").delete().eq("cat_id", catId).eq("user_id", user.id);
    setBusy(false);
    // 0017 的 policy 擋下沒有喵戶的人（錯誤是 RLS 拒絕）
    if (error) { if (want && hasHome === false) toGuide(withIntent(window.location.pathname, "fav")); return; }
    setOn(want);
  }

  // 從登入、建立喵戶回來：自動收藏一次
  useEffect(() => {
    if (resumed.current || on === undefined || hasHome !== true) return;
    const { intent, clean } = takeIntent(window.location.href);
    if (intent !== "fav") return;
    resumed.current = true;
    window.history.replaceState(null, "", clean);
    if (!on) toggle(true);
  }, [on, hasHome]); // eslint-disable-line react-hooks/exhaustive-deps

  function click() {
    if (!pass(withIntent(window.location.pathname, "fav"))) return;
    toggle();
  }

  return (
    <button type="button" className={`${s.fav} ${on ? s.favOn : ""}`} aria-pressed={Boolean(on)} disabled={busy} onClick={click}>
      <Icon name="heart" size={20} />{on ? "已收藏" : "收藏"}
    </button>
  );
}
