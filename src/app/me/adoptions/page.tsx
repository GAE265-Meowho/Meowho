"use client";
/* eslint-disable @next/next/no-img-element */
// 領養申請（#89 補）：中途一次看到自己所有待領養貓收到的領養問卷，在這裡看回答、標記狀態。
// 送出問卷時會通知喵戶長（0010），通知連到這裡的 #cat-<id>。看不看得到交給 meow_adoption_responses 的 RLS。
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import { Responses } from "@/components/adoption-form/Responses";
import s from "@/components/cats/catPage.module.css";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import type { Question } from "@/lib/adoption-form/questionnaire";
import { getBrowserSupabase } from "@/lib/supabase/client";

interface FormRow { id: string; questions: Question[]; is_open: boolean; cat_id: string; cat: { name: string; photo_url: string | null } }
interface Count { total: number; fresh: number }

export default function AdoptionsPage() {
  const { loading, user, login } = useAuth();
  const [forms, setForms] = useState<FormRow[] | undefined>(undefined);
  const [counts, setCounts] = useState<Record<string, Count>>({});

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (loading || !sb || !user) return;
    (async () => {
      const { data: homes } = await sb.from("meow_households").select("id").eq("owner_id", user.id).neq("caretaker_type", "cat_owner");
      const ids = (homes ?? []).map(h => h.id as string);
      if (!ids.length) { setForms([]); return; }
      const { data: fm } = await sb.from("meow_adoption_forms")
        .select("id, questions, is_open, cat_id, cat:meow_cats!inner(name, photo_url, household_id)").in("cat.household_id", ids);
      const list = (fm ?? []) as unknown as FormRow[];
      const { data: rs } = list.length
        ? await sb.from("meow_adoption_responses").select("form_id, status").in("form_id", list.map(x => x.id)).neq("status", "draft")
        : { data: [] };
      const c: Record<string, Count> = {};
      for (const r of (rs ?? []) as { form_id: string; status: string }[]) {
        c[r.form_id] = { total: (c[r.form_id]?.total ?? 0) + 1, fresh: (c[r.form_id]?.fresh ?? 0) + (r.status === "submitted" ? 1 : 0) };
      }
      setCounts(c);
      // 有新收到的排前面，再來是回覆多的
      setForms(list.sort((a, b) => (c[b.id]?.fresh ?? 0) - (c[a.id]?.fresh ?? 0) || (c[b.id]?.total ?? 0) - (c[a.id]?.total ?? 0)));
    })();
  }, [loading, user]);

  // 從通知點進來（#cat-<id>）時，捲到那隻貓
  useEffect(() => {
    if (forms?.length && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [forms]);

  const withReplies = (forms ?? []).filter(x => counts[x.id]);
  const quiet = (forms ?? []).filter(x => !counts[x.id]);

  let body: React.ReactNode;
  if (!getBrowserSupabase()) body = <p className={f.warn}>示範模式：還沒連接資料庫，沒有領養申請可以顯示。</p>;
  else if (loading || (user && forms === undefined)) body = <p className={f.lead} role="status">載入中…</p>;
  else if (!user) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>登入後查看領養申請</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton onClick={() => login("/me/adoptions")}>使用 Google 登入</CatButton></div>
    </section>
  );
  else if (!forms?.length) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>還沒有開放領養問卷</h2>
      <p className={f.lead}>在待領養貓的「修改」頁建立領養問卷，有人填寫後會出現在這裡。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/me">回到我的喵戶</CatButton></div>
    </section>
  );
  else body = (
    <>
      {withReplies.length === 0 && <p className={f.lead}>還沒有人填寫領養問卷，有人送出時會通知你。</p>}
      {withReplies.map(x => (
        <section key={x.id} id={`cat-${x.cat_id}`} className={f.card} aria-labelledby={`h-${x.cat_id}`}>
          <div className={s.applyHead}>
            <span className={s.applyPhoto}>{x.cat.photo_url ? <img src={x.cat.photo_url} alt="" /> : <Icon name="cat" size={28} />}</span>
            <div>
              <h2 id={`h-${x.cat_id}`}><a href={`/cats/${x.cat_id}`}>{x.cat.name}</a></h2>
              <p className={f.lead}>
                {counts[x.id].total} 份{counts[x.id].fresh ? `，${counts[x.id].fresh} 份新收到` : ""}{x.is_open ? "" : "・問卷已暫停"}
              </p>
            </div>
          </div>
          <Responses formId={x.id} questions={x.questions} />
        </section>
      ))}
      {quiet.length > 0 && (
        <section className={f.card} aria-labelledby="quiet">
          <h2 id="quiet">還沒有人填寫</h2>
          <ul className={s.list}>
            {quiet.map(x => <li key={x.id}><a href={`/cats/${x.cat_id}/edit#form-editor`}>{x.cat.name}</a>{x.is_open ? "" : "（問卷已暫停）"}</li>)}
          </ul>
        </section>
      )}
    </>
  );

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={f.title}>領養申請</h1>
        {body}
      </main>
      <TabBar />
    </>
  );
}
