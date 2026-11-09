"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import Icon from "@/components/ui/Icon";
import {
  ADOPT_REGIONS, MAP_SIZE, actionKey, coatKey, countByRegion, layoutCats, previewTags, regionOf,
  type RegionId,
} from "@/lib/adopt-map";
import type { FeedCat } from "@/lib/adopt-feed";
import CatSprite from "./CatSprite";
import RegionCanvas from "./RegionCanvas";
import styles from "./adoptMap.module.css";

type Props = {
  cats: FeedCat[];
  /** 目前個性篩選過不過。沒過的貓仍留在地圖上，只是變淡。 */
  matches: (catId: string) => boolean;
  onShowCard: (catId: string) => void;
};

function sideFor(x: number, width: number) {
  const ratio = x / width;
  if (ratio > 0.72) return "left";
  if (ratio < 0.28) return "right";
  return "up";
}

function Preview({ cat, side }: { cat: FeedCat; side: "up" | "left" | "right" }) {
  const [broken, setBroken] = useState(false);
  const tags = previewTags(cat.tags);
  return (
    <span className={styles.preview} role="tooltip" data-side={side}>
      {cat.photo && !broken ? (
        <img className={styles.shot} src={cat.photo} alt={`${cat.name}的照片`} onError={() => setBroken(true)} />
      ) : (
        <span className={styles.ph}><Icon name="cat" size={28} /></span>
      )}
      <strong>{cat.name}</strong>
      {cat.district && <span className={styles.where}>{cat.district}</span>}
      {tags.length > 0 && <span className={styles.tagline}>{tags.join("・")}</span>}
    </span>
  );
}

/** 先選北／中／南／東（離島另列），再在該範圍看等家的貓。點貓回到卡片。 */
export default function AdoptMap({ cats, matches, onShowCard }: Props) {
  const [region, setRegion] = useState<RegionId | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const counts = countByRegion(cats.map((cat) => cat.city));

  if (!region) {
    return (
      <div className={styles.pickerWrap}>
        <p className={styles.pickLead}>先選一個地區，看看哪裡有貓在等家</p>
        <div className={styles.picker} role="group" aria-label="選擇地區">
          {ADOPT_REGIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.region} ${item.id === "islands" ? styles.islands : ""}`}
              onClick={() => { setRegion(item.id); setExpanded(new Set()); setOpen(null); }}
            >
              <RegionCanvas region={item.id} variant="mini" />
              <span className={styles.regionLabel}>{item.label}</span>
              <span className={styles.regionName}>{item.name}</span>
              {item.note && <span className={styles.regionNote}>{item.note}</span>}
              <span className={styles.regionCount}>{counts[item.id]} 隻在等家</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const spec = ADOPT_REGIONS.find((item) => item.id === region)!;
  const size = MAP_SIZE[region];
  const here = cats.filter((cat) => regionOf(cat.city) === region);
  const markers = layoutCats(here.map((cat) => ({ ...cat, district: cat.area })), region, expanded);

  return (
    <div className={styles.mapCard}>
      <div className={styles.mapHead}>
        <p className={styles.kicker}>{spec.name}{spec.note ? `・${spec.note}` : ""}</p>
        <button type="button" className={styles.back} onClick={() => { setRegion(null); setOpen(null); setExpanded(new Set()); }}>
          換地區
        </button>
      </div>
      <div className={styles.stage}>
        <RegionCanvas region={region} />
        <span className={styles.compass} style={{ right: 22, bottom: 14, top: "auto" }}>北</span>
        {here.length === 0 && <p className={styles.empty} role="status">這裡還沒有等家的貓</p>}
        {markers.map((marker) => {
          if (marker.type === "pile") {
            return (
              <button
                key={marker.placeKey}
                type="button"
                className={styles.pile}
                style={{ left: `${(marker.x / size.width) * 100}%`, top: `${(marker.y / size.height) * 100}%`, zIndex: 3 }}
                aria-expanded={false}
                aria-label={marker.near ? `附近有 ${marker.count} 隻` : `${marker.city}${marker.district}，這區有 ${marker.count} 隻`}
                onClick={() => setExpanded((cur) => new Set(cur).add(marker.placeKey))}
              >
                {marker.near ? `附近有 ${marker.count} 隻` : `這區有 ${marker.count} 隻`}
              </button>
            );
          }
          const cat = marker.cat;
          const shown = open === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              className={`${styles.marker} ${matches(cat.id) ? "" : styles.dim}`}
              style={{ left: `${(cat.x / size.width) * 100}%`, top: `${(cat.y / size.height) * 100}%`, zIndex: shown ? 5 : 2 }}
              aria-label={`${cat.name}，${here.find((item) => item.id === cat.id)?.district || cat.city}，回到卡片`}
              onMouseEnter={() => setOpen(cat.id)}
              onMouseLeave={() => setOpen((cur) => (cur === cat.id ? null : cur))}
              onFocus={() => setOpen(cat.id)}
              onBlur={() => setOpen((cur) => (cur === cat.id ? null : cur))}
              onClick={() => onShowCard(cat.id)}
            >
              <CatSprite coat={coatKey(cat.coat)} action={actionKey(cat.tags)} cue={cat.tags.join("、")} />
              {shown && <Preview cat={{ ...cat, district: here.find((item) => item.id === cat.id)?.district ?? cat.district }} side={sideFor(cat.x, size.width)} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
