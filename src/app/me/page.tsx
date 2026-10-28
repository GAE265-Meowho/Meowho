"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import { CARETAKER_LABEL, MAX_HOUSEHOLDS_PER_ACCOUNT, canCreateHousehold, type CaretakerType } from "@/lib/onboarding/household";
import { ageLabel } from "@/lib/onboarding/cat";
import { getBrowserSupabase } from "@/lib/supabase/client";

interface Household { id: string; name: string; caretaker_type: CaretakerType; city: string; district: string; intro: string; cat_count: number | null }
interface CatRow { id: string; household_id: string; name: string; sex: string; birthday: string | null; est_age_months: number | null; zodiac: string | null; breed: string | null; coat: string | null; traits: string[]; photo_url: string | null; status: string }

// 我的貓戶（時光小屋入口）
export default function MyHomePage() {
  const { configured, loading, user, login, logout } = useAuth();
  const [homes, setHomes] = useState<Household[] | undefined>(undefined);
  const [cats, setCats] = useState<CatRow[]>([]);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (loading || !sb || !user) return;
    (async () => {
      const { data: h } = await sb.from("households").select("id, name, caretaker_type, city, district, intro, cat_count").eq("owner_id", user.id).order("created_at");
      const list = (h ?? []) as Household[];
      setHomes(list);
      if (list.length) {
        const { data: c } = await sb.from("cats").select("id, household_id, name, sex, birthday, est_age_months, zodiac, breed, coat, traits, photo_url, status").in("household_id", list.map(x => x.id)).order("created_at");
        setCats((c ?? []) as CatRow[]);
      }
    })();
  }, [loading, user]);

  let body: React.ReactNode;
  if (!configured) body = <p className="demo-note">示範模式：尚未連接資料庫，無法顯示你的貓戶。</p>;
  else if (loading) body = <p className="sub center">載入中…</p>;
  else if (!user) body = (
    <section className="profile-card center">
      <h2>🏠 我的貓戶</h2><p className="sub">登入後查看你的貓戶與貓咪。</p>
      <button className="btn block" onClick={() => login("/me")}>使用 Google 登入</button>
    </section>
  );
  else if (homes === undefined) body = <p className="sub center">載入中…</p>;
  else if (homes.length === 0) body = (
    <section className="profile-card center">
      <h2>你還沒有貓戶</h2><p className="sub">歡迎有貓的你！幫貓戶取個名字、設定縣市地區，用聊天的方式 3 分鐘完成貓戶和第一張貓咪名片。</p>
      <Link className="btn block" href="/onboarding">🏠 建立貓戶，給貓貓一個家</Link>
    </section>
  );
  else body = (
    <>
      {homes.map(home => {
        const list = cats.filter(c => c.household_id === home.id);
        return (
          <div key={home.id} style={{ display: "grid", gap: "1rem", marginBottom: "1.5rem" }}>
            <section className="profile-card">
              <p className="pill mint" style={{ justifySelf: "start" }}>{CARETAKER_LABEL[home.caretaker_type]}</p>
              <h1 className="h2">🏠 {home.name}</h1>
              <p className="sub">📍 {home.city}{home.district}{home.cat_count !== null ? `｜照顧 ${home.cat_count} 隻貓` : ""}</p>
              <p style={{ margin: 0 }}>{home.intro}</p>
            </section>
            <div className="sec-head">
              <h2 className="h2" style={{ fontSize: "1.2rem" }}>貓咪家人（{list.length}）</h2>
              <Link className="btn sm" href={`/onboarding?household=${home.id}`}>＋ 新增貓咪</Link>
            </div>
            {list.length === 0 && <p className="sub">還沒有貓咪，按「新增貓咪」拍照建立第一張名片吧！</p>}
            <div className="polaroids">
              {list.map((c, i) => (
                <article className="polaroid" key={c.id}>
                  <span className={`tape ${["pink", "mint", "butter"][i % 3]}`} aria-hidden="true" />
                  <div className="photo">{c.photo_url && <img src={c.photo_url} alt={`${c.name}的照片`} />}</div>
                  <div className="body">
                    <h3>{c.name} <small>{c.sex === "male" ? "♂" : c.sex === "female" ? "♀" : ""}｜{ageLabel({ birthday: c.birthday, estAgeMonths: c.est_age_months })}</small></h3>
                    <div className="meta">{[c.breed, c.coat, c.zodiac].filter(Boolean).join("｜")}</div>
                    <div className="tags">{c.traits.map(t => <span key={t} className="pill peach">{t}</span>)}</div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        );
      })}
      {canCreateHousehold(homes.length)
        ? <Link className="btn ghost block" href="/onboarding?new=1">🏠 建立第 {homes.length + 1} 個貓戶（每個帳號最多 {MAX_HOUSEHOLDS_PER_ACCOUNT} 個）</Link>
        : <p className="fine center">每個帳號最多 {MAX_HOUSEHOLDS_PER_ACCOUNT} 個貓戶，你已建立滿了。</p>}
      <p className="fine center" style={{ marginTop: "2rem" }}><button className="btn ghost sm" onClick={logout}>登出</button></p>
    </>
  );

  return (
    <>
      <SiteHeader />
      <main className="wrap onboarding">{body}</main>
      <TabBar />
    </>
  );
}
