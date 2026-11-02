"use client";
/* eslint-disable @next/next/no-img-element */
// 我的收藏（#70）：收藏的貓被領養後標「已被領養」，不自動移除，讓會員自己決定要不要刪
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import s from "@/components/cats/catPage.module.css";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { BODY_TYPE_LABEL, bodyTypeOf, type LifeStage } from "@/lib/cat-profile/life-stage";
import { getBrowserSupabase } from "@/lib/supabase/client";

type FormRef = { is_open: boolean } | { is_open: boolean }[] | null;

interface Row {
  cat_id: string;
  cat: {
    name: string; status: string; life_stage: LifeStage | null; photo_url: string | null;
    household: { city: string; district: string } | null; form: FormRef;
  } | null;
}

const formOpen = (fm: FormRef) => (Array.isArray(fm) ? fm.some(x => x.is_open) : Boolean(fm?.is_open));

export default function FavoritesPage() {
  const { loading, user, login } = useAuth();
  const [rows, setRows] = useState<Row[] | undefined>(undefined);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (loading || !sb || !user) return;
    sb.from("meow_cat_favorites")
      .select("cat_id, cat:meow_cats(name, status, life_stage, photo_url, household:meow_households(city, district), form:meow_adoption_forms(is_open))")
      .eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as unknown as Row[]));
  }, [loading, user]);

  async function remove(catId: string) {
    const sb = getBrowserSupabase();
    if (!sb || !user) return;
    const { error } = await sb.from("meow_cat_favorites").delete().eq("cat_id", catId).eq("user_id", user.id);
    if (!error) setRows(list => (list ?? []).filter(r => r.cat_id !== catId));
  }

  let body: React.ReactNode;
  if (!getBrowserSupabase()) body = <p className={f.warn}>示範模式：還沒連接資料庫，沒有收藏可以顯示。</p>;
  else if (loading || (user && rows === undefined)) body = <p className={f.lead} role="status">載入中…</p>;
  else if (!user) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>登入後查看你的收藏</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton onClick={() => login("/me/favorites")}>使用 Google 登入</CatButton></div>
    </section>
  );
  else if (!rows?.length) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>還沒有收藏的貓</h2>
      <p className={f.lead}>在貓咪頁按「收藏」，就會出現在這裡。</p>
    </section>
  );
  else body = (
    <ul className={s.grid}>
      {rows.map(r => {
        const c = r.cat;
        const adopted = !c || c.status !== "adoptable";
        return (
          <li key={r.cat_id} className={s.card}>
            <a className={s.photo} href={`/cats/${r.cat_id}`}>
              {c?.photo_url ? <img src={c.photo_url} alt={`${c.name}的照片`} /> : <Icon name="cat" size={56} />}
            </a>
            <h2 className={s.cardName}>{c?.name ?? "這隻貓已不公開"}</h2>
            <p className={s.cardMeta}>
              {[c?.life_stage && BODY_TYPE_LABEL[bodyTypeOf(c.life_stage)], c?.household && `${c.household.city}${c.household.district}`].filter(Boolean).join("・")}
            </p>
            <div className={s.tags}>
              <span className={`${s.tag} ${adopted ? "" : s.adoptable}`}>{adopted ? "已被領養" : "待領養"}</span>
            </div>
            <div className={s.cardActions}>
              {!adopted && c && formOpen(c.form) && <a className={s.textBtn} href={`/cats/${r.cat_id}/apply`}>填寫領養問卷</a>}
              <button type="button" className={s.textBtn} onClick={() => remove(r.cat_id)}>取消收藏</button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={f.title}>我的收藏</h1>
        {body}
      </main>
      <TabBar />
    </>
  );
}
