"use client";
/* eslint-disable @next/next/no-img-element */
// 帶我回家（#57）：首頁列出資料庫裡的待領養貓，等最久的排前面。
// 地圖依縣市＋行政區把同一批卡片放到北／中／南／東／離島。
// 沒連資料庫（示範模式）時用 lib/cats.ts 的示意資料。
import { useEffect, useState } from "react";
import CatPerch from "@/components/journey/CatPerch";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { FEED_SELECT, toFeedCat, type FeedCat, type FeedRow } from "@/lib/adopt-feed";
import { parseLocation } from "@/lib/adopt-map";
import { cats as demoCats } from "@/lib/cats";
import { getBrowserSupabase } from "@/lib/supabase/client";
import SectionHead from "../SectionHead";
import AdoptMap from "./AdoptMap";
import shared from "../section.module.css";
import styles from "./adopt.module.css";

/** 示範模式：示意資料轉成跟資料庫一樣的格式（貓沒有 id，用名字代替） */
function demoFeed(): FeedCat[] {
  return demoCats.map((c): FeedCat => {
    const loc = parseLocation(c.district);
    return {
      id: c.name, name: c.name, sex: c.sex, stage: c.age,
      district: loc ? `${loc.city}${loc.district}` : c.district,
      city: loc?.city ?? "", area: loc?.district ?? "", coat: c.coat,
      waitDays: c.waitDays, neutered: c.neutered,
      tags: c.tags, diary: c.diary, photo: c.photo.src, filters: c.filters, home: null,
    };
  });
}

export default function AdoptSection() {
  const [view, setView] = useState<"cards" | "map">("cards");
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [cats, setCats] = useState<FeedCat[] | null>(null);
  const live = Boolean(getBrowserSupabase());

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) { setCats(demoFeed()); return; }
    sb.from("meow_cats").select(FEED_SELECT).eq("status", "adoptable").order("created_at").limit(30)
      .then(({ data }) => setCats(((data ?? []) as unknown as FeedRow[]).map((r) => toFeedCat(r))));
  }, []);

  // From the map: switch to cards, then bring that cat's card into view and glow it briefly.
  const showCard = (id: string) => {
    setView("cards");
    setSpotlight(id);
  };

  useEffect(() => {
    if (!spotlight || view !== "cards") return;
    document.getElementById(`cat-${spotlight}`)?.scrollIntoView({ block: "center" });
    const t = window.setTimeout(() => setSpotlight(null), 2200);
    return () => window.clearTimeout(t);
  }, [spotlight, view]);

  const list = [...(cats ?? [])].sort((a, b) => b.waitDays - a.waitDays);

  return (
    <section id="adopt" className={`wrap ${shared.section}`} aria-labelledby="adopt-title">
      <SectionHead
        id="adopt-title"
        icon="heart"
        kicker="帶我回家領養站"
        title={
          <>
            <span>你在找貓，</span>
            <span>貓也在找你</span>
          </>
        }
        lead="每一隻貓貓的真實日常，讓貓找到你你也找到貓。"
      />

      <div className={styles.toolbar}>
        {/* 個性篩選先拿掉（#354）：等標籤規則定案再放回來；分類邏輯還在 lib/adopt-feed.ts */}
        <div className={styles.views} role="radiogroup" aria-label="檢視方式">
          {(
            [
              ["cards", "卡片", "grid"],
              ["map", "地圖", "map"],
            ] as const
          ).map(([v, l, icon]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? styles.on : undefined} onClick={() => setView(v)}>
              <Icon name={icon} size={15} />
              {l}
            </button>
          ))}
        </div>
        <span className={styles.count}>共 {list.length} 隻</span>
      </div>

      <div className={styles.gridWrap}>
        <CatPerch action="patrol" label="巡視等家的朋友" range={320} className={styles.perch} />
        {cats === null ? (
          <p className={styles.count} role="status">載入中…</p>
        ) : cats.length === 0 ? (
          <p className={styles.count}>目前還沒有待領養的貓。</p>
        ) : view === "map" ? (
          <AdoptMap cats={cats} onShowCard={showCard} />
        ) : (
          <ul className={styles.grid}>
            {list.map((c) => (
              <li key={c.id} id={`cat-${c.id}`} className={`${styles.card} ${spotlight === c.id ? styles.spotlight : ""}`}>
                <div className={styles.photo}>
                  {c.photo ? <img src={c.photo} alt={`${c.name}的照片`} loading="lazy" /> : <Icon name="cat" size={64} />}
                  <span className={styles.wait}>等家 {c.waitDays} 天</span>
                  {c.neutered && (
                    <span className={styles.neutered}>
                      <Icon name="check" size={13} />
                      已結紮
                    </span>
                  )}
                </div>
                <div className={styles.body}>
                  <div className={styles.nameRow}>
                    <h3>{c.name}</h3>
                    <span>{[c.sex, c.stage].filter(Boolean).join("｜")}</span>
                  </div>
                  {c.district && (
                    <p className={styles.district}>
                      <Icon name="pin" size={14} />
                      {c.district}
                    </p>
                  )}
                  <ul className={styles.tags}>
                    {c.tags.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  {c.diary && (
                    <p className={styles.diary}>
                      <span>
                        <Icon name="diary" size={14} />
                        中途日記
                      </span>
                      {c.diary}
                    </p>
                  )}
                  <div className={styles.actions}>
                    <CatButton href={live ? `/cats/${c.id}` : "/#adopt"} size="sm">
                      認識{c.name}
                    </CatButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
