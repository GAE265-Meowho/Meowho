"use client";
// 修改喵戶（#82）：沿用建立時的表單，身分固定；只有喵戶長改得動（RLS 會再擋一次）。最下方是刪除喵戶（我的喵戶改版）
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader } from "@/components/Chrome";
import { DeleteHome } from "@/components/me/DeleteSection";
import { HouseholdForm } from "@/components/onboarding/HouseholdForm";
import s from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import { fromHouseholdRow, type HouseholdForm as Form } from "@/lib/onboarding/household-rules";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function EditHomePage() {
  const { id } = useParams<{ id: string }>();
  const { loading, user } = useAuth();
  const [form, setForm] = useState<Form | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cats, setCats] = useState<{ id: string; origin_household_id: string | null }[]>([]);
  const [others, setOthers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (loading || !sb || !user) return;
    sb.from("meow_households").select("id, name, caretaker_type, city, district, intro, home, adoption_terms, org_name, org_proof_url, owner_id, avatar_path")
      .eq("owner_id", user.id).then(({ data, error: err }) => {
        const row = (data ?? []).find(h => h.id === id);
        if (err || !row) { setError("找不到這個喵戶，或你不是它的喵戶長。"); return; }
        setOthers((data ?? []).filter(h => h.id !== id).map(h => h.name));
        setAvatarPath(row.avatar_path ?? null);
        setName(row.name);
        // 每月預算在另一張只有喵戶長看得到的表（0025）；讀不到就留空讓他補
        sb.from("meow_household_budgets").select("monthly_twd").eq("household_id", id).maybeSingle()
          .then(({ data: b }) => setForm(fromHouseholdRow({ ...row, budget: b?.monthly_twd ?? null })));
      });
    sb.from("meow_cats").select("id, origin_household_id").eq("household_id", id).then(({ data }) => setCats(data ?? []));
  }, [loading, user, id]);

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={s.title}>修改喵戶</h1>
        {error && (
          <section className={`${s.card} ${s.center}`}>
            <p className={s.error} role="alert">{error}</p>
            <div className={s.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/me">回到我的喵戶</CatButton></div>
          </section>
        )}
        {!error && !form && <p className={s.lead} role="status">載入中…</p>}
        {form && <HouseholdForm userId={user?.id ?? null} existingNames={others} editing={{ id, form, avatarPath }} />}
        {form && <DeleteHome home={{ id, name }} cats={cats} />}
      </main>
    </>
  );
}
