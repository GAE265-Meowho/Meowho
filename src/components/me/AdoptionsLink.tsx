"use client";
// 「我的喵戶」上的入口（#128）：有中途喵戶的會員看到「領養管理」；開過對話串的會員看到「我的領養申請」。各自顯示幾段對話未讀。
import { useEffect, useState } from "react";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { isUnread, type DeskThread } from "@/lib/adoption-desk";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Row = Pick<DeskThread, "last_message_at" | "member_read_at" | "keeper_read_at"> & { member_id: string; household_id: string };

export function AdoptionsLink({ userId }: { userId: string }) {
  const [keeper, setKeeper] = useState<number | null>(null);
  const [member, setMember] = useState<number | null>(null);
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    (async () => {
      const [{ data: homes }, { data: rows }] = await Promise.all([
        sb.from("meow_households").select("id").eq("owner_id", userId).neq("caretaker_type", "cat_owner"),
        sb.from("meow_threads").select("member_id, household_id, last_message_at, member_read_at, keeper_read_at").limit(500),
      ]);
      const mine = new Set((homes ?? []).map(h => h.id as string));
      const list = (rows ?? []) as Row[];
      const asMember = list.filter(r => r.member_id === userId);
      // 讀不讀得到由 RLS 決定，這裡只依角色計算未讀
      const unread = (rs: Row[], role: "keeper" | "member") => rs.filter(r => isUnread(r, role)).length;
      if (mine.size) setKeeper(unread(list.filter(r => mine.has(r.household_id)), "keeper"));
      if (asMember.length) setMember(unread(asMember, "member"));
    })();
  }, [userId]);
  return (
    <>
      {keeper !== null && (
        <CatButton variant="ghost" size="sm" ears={false} href="/me/adoptions">
          <Icon name="diary" size={18} />領養管理{keeper ? `（${keeper} 則未讀）` : ""}
        </CatButton>
      )}
      {member !== null && (
        <CatButton variant="ghost" size="sm" ears={false} href="/me/applications">
          <Icon name="comment" size={18} />我的領養申請{member ? `（${member} 則未讀）` : ""}
        </CatButton>
      )}
    </>
  );
}
