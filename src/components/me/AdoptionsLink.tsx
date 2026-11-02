"use client";
// 「我的喵戶」上的「領養管理」入口（#128）：有中途喵戶、或開過對話串的會員才顯示，帶兩種角色合計的未讀數
import { useEffect, useState } from "react";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { isUnread, roleOf, type DeskThread } from "@/lib/adoption-desk";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Row = Pick<DeskThread, "member_id" | "last_message_at" | "member_read_at" | "keeper_read_at">;

export function AdoptionsLink({ userId }: { userId: string }) {
  const [unread, setUnread] = useState<number | null>(null);
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    (async () => {
      const [{ count: fosters }, { data: rows }] = await Promise.all([
        sb.from("meow_households").select("id", { count: "exact", head: true }).eq("owner_id", userId).neq("caretaker_type", "cat_owner"),
        // 讀得到哪些串由 RLS 決定（自己是會員的串＋自己喵戶的串）
        sb.from("meow_threads").select("member_id, last_message_at, member_read_at, keeper_read_at").limit(500),
      ]);
      const list = (rows ?? []) as Row[];
      if (!fosters && !list.length) return;
      setUnread(list.filter(r => isUnread(r, roleOf(r, userId))).length);
    })();
  }, [userId]);
  if (unread === null) return null;
  return (
    <CatButton variant="ghost" size="sm" ears={false} href="/me/adoptions">
      <Icon name="comment" size={18} />領養管理{unread ? `（${unread} 則未讀）` : ""}
    </CatButton>
  );
}
