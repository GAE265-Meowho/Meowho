"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader } from "@/components/Chrome";
import { TermsGate } from "@/components/TermsGate";
import { HouseholdForm } from "@/components/onboarding/HouseholdForm";
import { IntakeChat, type ExistingHome } from "@/components/onboarding/IntakeChat";
import s from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import { canAddHousehold, parseHouseholdLimit } from "@/lib/onboarding/household-rules";
import { decideStart, type StartPhase } from "@/lib/onboarding/route";
import { getBrowserSupabase } from "@/lib/supabase/client";

interface Home extends ExistingHome { city: string | null; district: string | null }
type HomeRow = { id: string; name: string; city: string | null; district: string | null; caretaker_type: Home["role"]; adoption_terms: Home["terms"] };
const toHome = (r: HomeRow): Home => ({ id: r.id, name: r.name, city: r.city, district: r.district, role: r.caretaker_type, terms: r.adoption_terms });

// 建立喵戶（表單）、在喵戶新增待領養貓（對話）（#72）。建好喵戶後回到「我的喵戶」，再從那裡新增貓。
// 示範模式（沒有 Supabase）不需登入、不存檔。
export default function OnboardingPage() {
  const { configured, loading, user, profile, needsTerms, login, agreeTerms } = useAuth();
  const [phase, setPhase] = useState<StartPhase | "checking">("checking");
  const [homes, setHomes] = useState<Home[]>([]);
  const [home, setHome] = useState<Home | null>(null);
  const [limit, setLimit] = useState<number | null>(null);

  useEffect(() => {
    if (loading) return;
    const sb = getBrowserSupabase();
    const params = new URLSearchParams(window.location.search);
    const decide = (list: Home[], householdLimit: number | null = null) => {
      const target = list.find(h => h.id === params.get("household")) ?? null;
      setHome(target);
      // 未登入也要設定 phase，否則會一直停在載入中（正式站 #72 的問題）
      setPhase(decideStart({
        configured: Boolean(sb), loggedIn: Boolean(user), wantCat: params.get("cat") === "1",
        wantNew: params.get("new") === "1", homesCount: list.length, householdLimit, targetFound: Boolean(target),
      }));
    };
    if (!sb || !user) { decide([]); return; }
    Promise.all([
      sb.from("meow_households").select("id, name, city, district, caretaker_type, adoption_terms").eq("owner_id", user.id).order("created_at"),
      sb.from("meow_site_settings").select("value").eq("key", "household_limit").maybeSingle(),
    ]).then(([{ data, error }, { data: setting }]) => {
      const list = error ? [] : ((data ?? []) as HomeRow[]).map(toHome);
      const lim = parseHouseholdLimit(setting?.value);
      setHomes(list);
      setLimit(lim);
      decide(list, lim);
    });
  }, [loading, user]);

  let body: React.ReactNode;
  if (loading || phase === "checking") {
    body = <p className={s.lead} role="status">載入中…</p>;
  } else if (phase === "login") {
    body = (
      <section className={`${s.card} ${s.center}`} aria-labelledby="login-title">
        <h2 id="login-title">先登入，再來建立喵戶</h2>
        <p className={s.lead}>用 Google 帳號登入後，就可以建立喵戶、新增待領養的貓。</p>
        <div className={s.actions} style={{ justifyContent: "center" }}>
          <CatButton onClick={() => login(window.location.pathname + window.location.search)}>使用 Google 登入</CatButton>
        </div>
      </section>
    );
  } else if (needsTerms) {
    body = <TermsGate onAgree={agreeTerms} />;
  } else if (phase === "choose") {
    const canNew = canAddHousehold(homes.length, limit);
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
              <div><b>建立新的喵戶</b>{limit !== null && <span>還可以建立 {limit - homes.length} 個</span>}</div>
              <CatButton size="sm" onClick={() => { setHome(null); setPhase("household"); }}>建立新的喵戶</CatButton>
            </li>
          ) : (
            <li className={s.homeItem}><div><b>喵戶已達上限</b><span>每個帳號最多 {limit} 個喵戶，每個喵戶都可以新增很多隻貓。</span></div></li>
          )}
        </ul>
      </section>
    );
  } else if (phase === "cat" && home) {
    body = <IntakeChat key={home.id} userId={user?.id ?? null} home={home} />;
  } else {
    // 示範模式沒有「我的喵戶」可以回去，建好後直接在這裡新增貓
    body = <HouseholdForm userId={user?.id ?? null} displayName={profile?.display_name ?? null}
      onDemoCreated={(name, role) => { setHome({ id: "demo", name, city: null, district: null, role: role ?? "personal_foster", terms: null }); setPhase("cat"); }} />;
  }

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={s.title}>{phase === "cat" || phase === "choose" ? "新增貓咪" : "建立喵戶"}</h1>
        {!configured && <p className={s.warn}>示範模式：還沒連接資料庫，可以完整操作，但資料不會儲存。</p>}
        {body}
      </main>
    </>
  );
}
