"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader } from "@/components/Chrome";
import { TermsGate } from "@/components/TermsGate";
import { CatFlow } from "@/components/onboarding/CatFlow";
import { HouseholdFlow } from "@/components/onboarding/HouseholdFlow";
import { WelcomeHousehold } from "@/components/onboarding/WelcomeHousehold";
import { MAX_HOUSEHOLDS_PER_ACCOUNT, canCreateHousehold } from "@/lib/onboarding/household";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { decideStart } from "@/lib/onboarding/route";

type Phase = "checking" | "intro" | "choose" | "household" | "cat" | "done";
interface Home { id: string | null; name: string; city?: string; district?: string }

export default function OnboardingPage() {
  const { configured, loading, user, needsTerms, login, agreeTerms } = useAuth();
  const [phase, setPhase] = useState<Phase>("checking");
  const [homes, setHomes] = useState<Home[]>([]);
  const [current, setCurrent] = useState<Home>({ id: null, name: "" });
  const [justCreated, setJustCreated] = useState(false);
  const [catName, setCatName] = useState("");
  const [catRound, setCatRound] = useState(0);
  const [catMode, setCatMode] = useState(false);

  // 進入點：新貓入戶一律先登入並選擇「新家」或「既有貓戶」；建立貓戶時沒有貓戶先看說明
  useEffect(() => {
    if (loading) return;
    const sb = getBrowserSupabase();
    const params = new URLSearchParams(window.location.search);
    const wantCat = params.get("cat") === "1";
    setCatMode(wantCat);
    const decide = (list: Home[]) => {
      const target = list.find(h => h.id === params.get("household"));
      const phase = decideStart({ configured: Boolean(sb), loggedIn: Boolean(user), wantCat, wantNew: params.get("new") === "1", homesCount: list.length, targetFound: Boolean(target) });
      if (phase === "login") return; // 由下方登入畫面處理
      if (phase === "cat" && target) setCurrent(target);
      setPhase(phase);
    };
    if (!sb || !user) { decide([]); return; }
    sb.from("meow_households").select("id, name, city, district").eq("owner_id", user.id).order("created_at").then(({ data }) => {
      const list = (data ?? []) as Home[];
      setHomes(list);
      decide(list);
    });
  }, [loading, user]);

  const startCat = (h: Home, created = false) => { setCurrent(h); setJustCreated(created); setCatRound(r => r + 1); setPhase("cat"); };

  let body: React.ReactNode;
  if (loading || phase === "checking") {
    body = <p className="sub center">載入中…</p>;
  } else if (configured && !user && catMode) {
    body = (
      <section className="profile-card center">
        <div className="big-emoji" aria-hidden="true">🐱</div>
        <h2>新貓入戶，先登入</h2>
        <p className="sub">用 Google 帳號登入後，選擇新來的貓咪要住進「新家」還是你已經有的貓戶。</p>
        <button className="btn block" onClick={() => login(window.location.pathname + window.location.search)}>使用 Google 註冊／登入</button>
      </section>
    );
  } else if (configured && !user) {
    body = (
      <>
      <WelcomeHousehold />
      <section className="profile-card center">
        <h2>🏠 先登入，開始建立貓戶</h2>
        <p className="sub">用 Google 帳號註冊／登入後，喵喵小幫手會用聊天的方式陪你建立貓戶和貓咪名片，大約 3 分鐘。一個帳號最多可以建立 {MAX_HOUSEHOLDS_PER_ACCOUNT} 個貓戶。</p>
        <button className="btn block" onClick={() => login(window.location.pathname + window.location.search)}>使用 Google 註冊／登入</button>
      </section>
      </>
    );
  } else if (needsTerms) {
    body = <TermsGate onAgree={agreeTerms} />;
  } else if (phase === "intro") {
    body = <WelcomeHousehold onStart={() => setPhase("household")} />;
  } else if (phase === "choose") {
    const canNew = canCreateHousehold(homes.length);
    body = (
      <section className="profile-card">
        <h2>{catMode ? "🐱 新來的貓咪要住進哪一戶？" : "🐾 要做什麼呢？"}</h2>
        {catMode && <p className="sub">選好貓戶後，再拍照、聊幾句幫牠建立名片。</p>}
        <div className="chooser" role="list">
          {homes.map(h => (
            <div className="chooser-item" role="listitem" key={h.id}>
              <div><b>🏠 {h.name}</b><span className="sub">📍 {h.city}{h.district}</span></div>
              <button className="btn mint sm" onClick={() => startCat(h)}>{catMode ? "住進這一戶" : "＋ 新增貓咪到這裡"}</button>
            </div>
          ))}
          {canNew && (
            <div className="chooser-item new-home" role="listitem">
              <div><b>✨ 住進新家</b><span className="sub">{homes.length === 0 ? "你還沒有貓戶，先幫貓咪建一個家" : `建立新的貓戶（還可以建立 ${MAX_HOUSEHOLDS_PER_ACCOUNT - homes.length} 個）`}</span></div>
              <button className="btn sm" onClick={() => setPhase(catMode ? "household" : "intro")}>建立新家</button>
            </div>
          )}
        </div>
        {!canNew && <p className="fine">每個帳號最多 {MAX_HOUSEHOLDS_PER_ACCOUNT} 個貓戶，你已經建立滿了；每個貓戶可以新增很多貓咪。</p>}
      </section>
    );
  } else if (phase === "household") {
    body = <HouseholdFlow onCreated={(id, name) => { const h = { id, name }; setHomes(l => [...l, h]); startCat(h, true); }} />;
  } else if (phase === "cat") {
    body = <CatFlow key={catRound} first={justCreated} householdId={current.id} householdName={current.name} onSaved={n => { setCatName(n); setPhase("done"); }} />;
  } else {
    body = (
      <section className="profile-card center">
        <div className="big-emoji" aria-hidden="true">🎉</div>
        <h2>{catName} 的貓咪名片建立好了！</h2>
        <p className="sub">{configured ? `已加入「${current.name}」。你可以繼續新增貓咪，或到「我的貓戶」查看。` : "（示範模式：資料沒有儲存。設定 Supabase 後就會真的存起來）"}</p>
        <div className="row-actions">
          <button className="btn ghost" onClick={() => startCat(current)}>再新增一隻</button>
          <Link className="btn" href="/me">去我的貓戶</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap onboarding">
        {!configured && <p className="demo-note">示範模式：尚未連接資料庫，可以完整操作，但資料不會儲存。</p>}
        {body}
      </main>
    </>
  );
}
