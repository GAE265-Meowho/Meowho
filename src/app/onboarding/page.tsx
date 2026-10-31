"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader } from "@/components/Chrome";
import { TermsGate } from "@/components/TermsGate";
import { IntakeChat, type ExistingHome } from "@/components/onboarding/IntakeChat";
import s from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import { MAX_HOUSEHOLDS_PER_ACCOUNT, canCreateHousehold } from "@/lib/onboarding/household";
import { decideStart, type StartPhase } from "@/lib/onboarding/route";
import { getBrowserSupabase } from "@/lib/supabase/client";

interface Home extends ExistingHome { city: string | null; district: string | null }

// 建立喵戶與待領養貓（#72）。沒有喵戶的人一進來就直接開始對話；有喵戶的人先選要加到哪一戶。
// 示範模式（沒有 Supabase）不需登入、不存檔。
export default function OnboardingPage() {
  const { configured, loading, user, needsTerms, login, agreeTerms } = useAuth();
  const [phase, setPhase] = useState<StartPhase | "checking">("checking");
  const [homes, setHomes] = useState<Home[]>([]);
  const [home, setHome] = useState<Home | null>(null);

  useEffect(() => {
    if (loading) return;
    const sb = getBrowserSupabase();
    const params = new URLSearchParams(window.location.search);
    const decide = (list: Home[]) => {
      const target = list.find(h => h.id === params.get("household")) ?? null;
      setHome(target);
      // 未登入也要設定 phase，否則會一直停在載入中（正式站 #72 的問題）
      setPhase(decideStart({
        configured: Boolean(sb), loggedIn: Boolean(user), wantCat: params.get("cat") === "1",
        wantNew: params.get("new") === "1", homesCount: list.length, targetFound: Boolean(target),
      }));
    };
    if (!sb || !user) { decide([]); return; }
    sb.from("meow_households").select("id, name, city, district").eq("owner_id", user.id).order("created_at").then(({ data, error }) => {
      const list = error ? [] : (data ?? []) as Home[];
      setHomes(list);
      decide(list);
    });
  }, [loading, user]);

  let body: React.ReactNode;
  if (loading || phase === "checking") {
    body = <p className={s.lead} role="status">載入中…</p>;
  } else if (phase === "login") {
    body = (
      <section className={`${s.card} ${s.center}`} aria-labelledby="login-title">
        <h2 id="login-title">先登入，再來建立喵戶</h2>
        <p className={s.lead}>用 Google 帳號登入後，小幫手會用聊天的方式陪你建立喵戶和第一隻待領養的貓。</p>
        <div className={s.actions} style={{ justifyContent: "center" }}>
          <CatButton onClick={() => login(window.location.pathname + window.location.search)}>使用 Google 登入</CatButton>
        </div>
      </section>
    );
  } else if (needsTerms) {
    body = <TermsGate onAgree={agreeTerms} />;
  } else if (phase === "choose") {
    const canNew = canCreateHousehold(homes.length);
    body = (
      <section className={s.card} aria-labelledby="choose-title">
        <h2 id="choose-title">要把貓加到哪一個喵戶？</h2>
        <ul className={s.homeList}>
          {homes.map(h => (
            <li className={s.homeItem} key={h.id}>
              <div><b>{h.name}</b><span>{h.city}{h.district}</span></div>
              <CatButton size="sm" variant="ghost" onClick={() => { setHome(h); setPhase("cat"); }}>加到這裡</CatButton>
            </li>
          ))}
          {canNew ? (
            <li className={s.homeItem}>
              <div><b>建立新的喵戶</b><span>還可以建立 {MAX_HOUSEHOLDS_PER_ACCOUNT - homes.length} 個</span></div>
              <CatButton size="sm" onClick={() => { setHome(null); setPhase("household"); }}>建立新的喵戶</CatButton>
            </li>
          ) : (
            <li className={s.homeItem}><div><b>喵戶已達上限</b><span>每個帳號最多 {MAX_HOUSEHOLDS_PER_ACCOUNT} 個喵戶，每個喵戶都可以新增很多隻貓。</span></div></li>
          )}
        </ul>
      </section>
    );
  } else {
    body = <IntakeChat key={home?.id ?? "new"} userId={user?.id ?? null} home={phase === "cat" ? home : null} />;
  }

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={s.title}><span>建立喵戶</span><span>和待領養貓</span></h1>
        {!configured && <p className={s.warn}>示範模式：還沒連接資料庫，可以完整操作，但資料不會儲存。</p>}
        {body}
      </main>
    </>
  );
}
