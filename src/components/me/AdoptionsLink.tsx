"use client";
// 「我的喵戶」上的「領養申請」入口：只給有中途喵戶的會員，顯示新收到幾份
import { useEffect, useState } from "react";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { getBrowserSupabase } from "@/lib/supabase/client";

export function AdoptionsLink({ userId }: { userId: string }) {
  const [fresh, setFresh] = useState<number | null>(null);
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    (async () => {
      const { count: fosters } = await sb.from("meow_households").select("id", { count: "exact", head: true })
        .eq("owner_id", userId).neq("caretaker_type", "cat_owner");
      if (!fosters) return;
      // 自己填的問卷也讀得到，所以排除自己是填寫人的
      const { count } = await sb.from("meow_adoption_responses").select("id", { count: "exact", head: true })
        .eq("status", "submitted").neq("respondent_id", userId);
      setFresh(count ?? 0);
    })();
  }, [userId]);
  if (fresh === null) return null;
  return (
    <CatButton variant="ghost" size="sm" ears={false} href="/me/adoptions">
      <Icon name="diary" size={18} />領養申請{fresh ? `（${fresh} 份新的）` : ""}
    </CatButton>
  );
}
