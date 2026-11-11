"use client";
/* eslint-disable @next/next/no-img-element */
// 中途喵戶總覽頁（#354）：從貓咪頁點喵戶名稱進來，看這個中途的名片和所有正在等家的貓。
// 不用登入。喵戶讀不讀得到交給 meow_households 的 RLS（不公開的喵戶讀不到）；貓只列待領養的，跟首頁同一種卡片。
// 只顯示公開資料：名稱、類型、縣市＋區、介紹、頭像（lib/household-page.ts）。一般飼主的喵戶不開放這一頁。
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteHeader, TabBar } from "@/components/Chrome";
import CatCard from "@/components/home/adopt/CatCard";
import grid from "@/components/home/adopt/adopt.module.css";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { FEED_SELECT, toFeedCat, type FeedCat, type FeedRow } from "@/lib/adopt-feed";
import { HOUSEHOLD_PUBLIC_SELECT, toPublicHome, type HouseholdPublicRow, type PublicHome } from "@/lib/household-page";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { photoSrc } from "@/lib/supabase/config";
import s from "./household.module.css";

export default function HouseholdPage() {
  const { id } = useParams<{ id: string }>();
  const sb = getBrowserSupabase();
  const [home, setHome] = useState<PublicHome | null | undefined>(undefined);
  const [cats, setCats] = useState<FeedCat[]>([]);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const [{ data: row }, { data: rows }] = await Promise.all([
        sb.from("meow_households").select(HOUSEHOLD_PUBLIC_SELECT).eq("id", id).maybeSingle(),
        sb.from("meow_cats").select(FEED_SELECT).eq("household_id", id).eq("status", "adoptable").order("created_at").limit(60),
      ]);
      const h = toPublicHome(row as HouseholdPublicRow | null);
      setHome(h);
      // 等最久的排前面（跟首頁一樣）
      setCats(h ? ((rows ?? []) as unknown as FeedRow[]).map((r) => toFeedCat(r)).sort((a, b) => b.waitDays - a.waitDays) : []);
    })();
  }, [sb, id]);

  let body: React.ReactNode;
  if (!sb) body = <p className={f.warn}>示範模式：還沒連接資料庫，沒有喵戶可以顯示。</p>;
  else if (home === undefined) body = <p className={f.lead} role="status">載入中…</p>;
  else if (home === null) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>找不到這個喵戶</h2>
      <p className={f.lead}>它可能沒有公開，或網址打錯了。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/#adopt">看等家的貓</CatButton></div>
    </section>
  );
  else body = (
    <>
      <section className={s.head} aria-labelledby="home-name">
        <span className={s.avatar}>
          {home.avatarPath ? <img src={photoSrc(sb, home.avatarPath)} alt="" /> : <Icon name="house" size={40} />}
        </span>
        <div className={s.text}>
          <div className={s.badges}>
            <span className={s.kicker}><Icon name="paw" size={16} />{home.kind}</span>
            {home.verified && <span className={s.verified}><Icon name="check" size={16} />已認證</span>}
          </div>
          <h1 id="home-name" className={s.name}>{home.name}</h1>
          {home.place && <span className={s.place}><Icon name="pin" size={18} />{home.place}</span>}
          {home.intro && <p className={s.intro}>{home.intro}</p>}
        </div>
      </section>

      <section className={s.cats} aria-labelledby="home-cats">
        <div className={s.catsHead}>
          <h2 id="home-cats">等家的貓</h2>
          {cats.length > 0 && <span className={s.count}>共 {cats.length} 隻</span>}
        </div>
        {cats.length === 0 ? (
          <div className={s.empty}>
            <Icon name="cat" size={48} />
            <p>這個喵戶目前沒有等家的貓。</p>
            <CatButton variant="ghost" href="/#adopt">看其他等家的貓</CatButton>
          </div>
        ) : (
          <ul className={grid.grid}>
            {cats.map((c) => <CatCard key={c.id} cat={c} href={`/cats/${c.id}`} />)}
          </ul>
        )}
      </section>
    </>
  );

  return (
    <>
      <SiteHeader />
      <main className={s.page}>{body}</main>
      <TabBar />
    </>
  );
}
