"use client";
// 收藏貓咪（#70）：按一次收藏、再按一次取消；沒登入就先登入
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { getBrowserSupabase } from "@/lib/supabase/client";
import Icon from "../ui/Icon";
import s from "./catPage.module.css";

export function FavoriteButton({ catId }: { catId: string }) {
  const { user, login } = useAuth();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb || !user) return;
    sb.from("meow_cat_favorites").select("cat_id").eq("cat_id", catId).eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setOn(Boolean(data)));
  }, [user, catId]);

  async function toggle() {
    const sb = getBrowserSupabase();
    if (!sb) return;
    if (!user) { login(window.location.pathname); return; }
    setBusy(true);
    const { error } = on
      ? await sb.from("meow_cat_favorites").delete().eq("cat_id", catId).eq("user_id", user.id)
      : await sb.from("meow_cat_favorites").insert({ cat_id: catId, user_id: user.id });
    if (!error) setOn(!on);
    setBusy(false);
  }

  return (
    <button type="button" className={`${s.fav} ${on ? s.favOn : ""}`} aria-pressed={on} disabled={busy} onClick={toggle}>
      <Icon name="heart" size={20} />{on ? "已收藏" : "收藏"}
    </button>
  );
}
