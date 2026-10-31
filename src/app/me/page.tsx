"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import type { VerificationRow } from "@/components/VerificationApply";
import { MyHomes, type CatRow, type Household } from "@/components/me/MyHomes";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import { MAX_HOUSEHOLDS_PER_ACCOUNT, canCreateHousehold } from "@/lib/onboarding/household";
import { getBrowserSupabase } from "@/lib/supabase/client";
import s from "@/components/me/me.module.css";

// 我的喵戶：喵戶長管理自己的喵戶，並從這裡新增待領養貓（#72）。也是時光小屋的入口。
// 貓咪欄位用 0004 新增的 life_stage、personality_tags，這頁要和 0004 一起上線。
export default function MyHomePage() {
  const { configured, loading, user, login, logout } = useAuth();
  const [homes, setHomes] = useState<Household[] | undefined>(undefined);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [verifs, setVerifs] = useState<VerificationRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (loading || !sb || !user) return;
    (async () => {
      const { data: h, error } = await sb.from("meow_households").select("id, name, caretaker_type, city, district, intro, verified_shelter").eq("owner_id", user.id).order("created_at");
      if (error) { setLoadError(error.message); setHomes([]); return; }
      const list = (h ?? []) as Household[];
      setHomes(list);
      if (!list.length) return;
      const ids = list.map(x => x.id);
      const [{ data: c, error: cErr }, { data: v }] = await Promise.all([
        sb.from("meow_cats").select("id, household_id, name, sex, birthday, est_age_months, life_stage, coat, breed, personality_tags, photo_url, status").in("household_id", ids).order("created_at"),
        sb.from("meow_shelter_verifications").select("id, household_id, status, review_note, created_at").in("household_id", ids).order("created_at", { ascending: false }),
      ]);
      if (cErr) setLoadError(cErr.message);
      setCats((c ?? []) as CatRow[]);
      setVerifs((v ?? []) as VerificationRow[]);
    })();
  }, [loading, user]);

  let body: React.ReactNode;
  if (!configured) body = <p className={f.warn}>示範模式：還沒連接資料庫，沒有喵戶可以顯示。</p>;
  else if (loading || (user && homes === undefined)) body = <p className={f.lead} role="status">載入中…</p>;
  else if (!user) body = (
    <section className={`${f.card} ${f.center}`} aria-labelledby="me-login">
      <h2 id="me-login">登入後管理你的喵戶</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton onClick={() => login("/me")}>使用 Google 登入</CatButton></div>
    </section>
  );
  else if (!homes?.length) body = (
    <section className={`${f.card} ${f.center}`} aria-labelledby="me-empty">
      <h2 id="me-empty">你還沒有喵戶</h2>
      <p className={f.lead}>用聊天的方式，幾分鐘就能建好。</p>
      {loadError && <p className={f.error} role="alert">讀取失敗：{loadError}</p>}
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton href="/onboarding">建立喵戶</CatButton></div>
    </section>
  );
  else body = (
    <>
      {loadError && <p className={f.error} role="alert">讀取失敗：{loadError}</p>}
      <MyHomes homes={homes} cats={cats} verifs={verifs} onVerification={row => setVerifs(v => [row, ...v])} />
      <div className={s.footer}>
        {canCreateHousehold(homes.length)
          ? <CatButton variant="ghost" href="/onboarding?new=1">建立新的喵戶</CatButton>
          : <p className={f.lead}>每個帳號最多 {MAX_HOUSEHOLDS_PER_ACCOUNT} 個喵戶，每個喵戶都可以新增很多隻貓。</p>}
        <CatButton variant="ghost" size="sm" ears={false} tail={false} onClick={logout}>登出</CatButton>
      </div>
    </>
  );

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={f.title}>我的喵戶</h1>
        {body}
      </main>
      <TabBar />
    </>
  );
}
