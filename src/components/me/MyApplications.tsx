"use client";
// 我填過的領養問卷（#89）：草稿可以接著填；送出後的進度與對話在「我的領養申請」（#128）
import { useEffect, useState } from "react";
import { RESPONSE_STATUS, type ResponseStatus } from "@/components/adoption-form/answer-text";
import f from "@/components/onboarding/intake.module.css";
import { getBrowserSupabase } from "@/lib/supabase/client";
import s from "./me.module.css";

interface Row { id: string; status: ResponseStatus; submitted_at: string | null; form: { cat_id: string; cat: { name: string } | null } | null }

export function MyApplications({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    sb.from("meow_adoption_responses").select("id, status, submitted_at, form:meow_adoption_forms(cat_id, cat:meow_cats(name))")
      .eq("respondent_id", userId).order("created_at", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as unknown as Row[]));
  }, [userId]);
  if (!rows.length) return null;
  return (
    <section className={f.card} aria-labelledby="my-apps">
      <h2 id="my-apps">我填過的領養問卷</h2>
      <ul className={s.apps}>
        {rows.map(r => (
          <li key={r.id}>
            <b>{r.form?.cat?.name ?? "貓咪"}</b>
            <span className={s.tag}>{r.status === "draft" ? "草稿" : RESPONSE_STATUS[r.status]}</span>
            {r.status === "draft" && r.form && <a className={s.textBtn} href={`/cats/${r.form.cat_id}/apply`}>接著填</a>}
            {r.status !== "draft" && <a className={s.textBtn} href="/me/applications">看對話</a>}
          </li>
        ))}
      </ul>
    </section>
  );
}
