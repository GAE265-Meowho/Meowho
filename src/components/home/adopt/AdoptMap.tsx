"use client";

/* eslint-disable @next/next/no-img-element */
import { useLayoutEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import {
  ADOPT_REGIONS, MAP_SIZE, actionKey, coatKey, countByRegion, layoutCats, previewTags, regionOf, separateFoldFromPreview,
  type RegionId,
} from "@/lib/adopt-map";
import { aboveCountyLabel, countyLabels } from "@/lib/geo/county-labels";
import type { FeedCat } from "@/lib/adopt-feed";
import CatSprite from "./CatSprite";
import RegionCanvas from "./RegionCanvas";
import styles from "./adoptMap.module.css";

type Props = {
  cats: FeedCat[];
  /** 目前個性篩選過不過。沒過的貓仍留在地圖上，只是變淡。 */
  onShowCard: (catId: string) => void;
};

function sideFor(x: number, width: number) {
  const ratio = x / width;
  if (ratio > 0.72) return "left";
  if (ratio < 0.28) return "right";
  return "up";
}

function Preview({ cat, side, nudgeX = 0, nudgeY = 0 }: { cat: FeedCat; side: "up" | "left" | "right"; nudgeX?: number; nudgeY?: number }) {
  const [broken, setBroken] = useState(false);
  const tags = previewTags(cat.tags);
  return (
    <span
      className={styles.preview}
      role="tooltip"
      data-side={side}
      style={{ ["--tip-x" as string]: `${nudgeX}px`, ["--tip-y" as string]: `${nudgeY}px` }}
    >
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

/** 手機沒有滑過：第一次點只打開簡歷，再點同一隻才回到卡片。 */
function usesTapPreview() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: none), (pointer: coarse), (max-width: 767px)").matches;
}

/** 先選北／中／南／東（離島另列），再在該範圍看等家的貓。點貓回到卡片。 */
export default function AdoptMap({ cats, onShowCard }: Props) {
  const [region, setRegion] = useState<RegionId | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [shift, setShift] = useState({ forId: null as string | null, foldY: 0, tipX: 0, tipY: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const pinned = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!open || !usesTapPreview()) {
      setShift((cur) => (cur.forId === null && cur.foldY === 0 && cur.tipX === 0 && cur.tipY === 0 ? cur : { forId: null, foldY: 0, tipX: 0, tipY: 0 }));
      return;
    }
    if (shift.forId !== open) {
      setShift({ forId: open, foldY: 0, tipX: 0, tipY: 0 });
      return;
    }
    const stage = stageRef.current;
    const tip = stage?.querySelector<HTMLElement>("[role='tooltip']");
    const foldEl = stage?.querySelector<HTMLElement>("[data-fold]");
    if (!stage || !tip || !foldEl) return;
    const bounds = stage.getBoundingClientRect();
    const box = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    const next = separateFoldFromPreview(box(foldEl), box(tip), {
      left: 8,
      top: bounds.top + 4,
      right: window.innerWidth - 8,
      bottom: bounds.bottom - 4,
    });
    if (next.fold.y === 0 && next.preview.x === 0 && next.preview.y === 0) return;
    setShift({
      forId: open,
      foldY: shift.foldY + next.fold.y,
      tipX: shift.tipX + next.preview.x,
      tipY: shift.tipY + next.preview.y,
    });
  }, [open, shift, region, expanded]);
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
      <div className={styles.stage} ref={stageRef}>
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
                aria-label={`附近有 ${marker.count} 隻`}
                onClick={() => setExpanded((cur) => new Set(cur).add(marker.placeKey))}
              >
                {`附近有 ${marker.count} 隻`}
              </button>
            );
          }
          if (marker.type === "collapse") {
            const label = countyLabels(region).find((item) => item.name === marker.city);
            const at = label ? aboveCountyLabel(label) : marker;
            return (
              <button
                key={`fold:${marker.placeKey}`}
                type="button"
                className={styles.fold}
                data-fold=""
                style={{ left: `${(at.x / size.width) * 100}%`, top: `${(at.y / size.height) * 100}%`, zIndex: 9, ["--fold-y" as string]: `${shift.forId ? shift.foldY : 0}px` }}
                aria-expanded
                aria-label={`收攏，回到附近有 ${marker.count} 隻`}
                onClick={() => {
                  setExpanded((cur) => {
                    const next = new Set(cur);
                    next.delete(marker.placeKey);
                    return next;
                  });
                  pinned.current = null;
                  setOpen(null);
                }}
              >
                收攏
              </button>
            );
          }
          const cat = marker.cat;
          const shown = open === cat.id;
          const raised = marker.placeKey.startsWith("near:");
          return (
            <button
              key={cat.id}
              type="button"
              className={styles.marker}
              style={{ left: `${(cat.x / size.width) * 100}%`, top: `${(cat.y / size.height) * 100}%`, zIndex: shown ? 10 : raised ? 6 : 2 }}
              aria-label={`${cat.name}，${here.find((item) => item.id === cat.id)?.district || cat.city}，回到卡片`}
              onMouseEnter={() => { if (!usesTapPreview()) setOpen(cat.id); }}
              onMouseLeave={() => { if (!usesTapPreview()) setOpen((cur) => (cur === cat.id ? null : cur)); }}
              onFocus={() => setOpen(cat.id)}
              onBlur={() => {
                if (usesTapPreview()) pinned.current = null;
                setOpen((cur) => (cur === cat.id ? null : cur));
              }}
              onClick={() => {
                if (!usesTapPreview()) { onShowCard(cat.id); return; }
                if (pinned.current === cat.id) { onShowCard(cat.id); return; }
                pinned.current = cat.id;
                setOpen(cat.id);
              }}
            >
              <CatSprite coat={coatKey(cat.coat)} action={actionKey(cat.tags)} cue={cat.tags.join("、")} />
              {shown && (
                <Preview
                  cat={{ ...cat, district: here.find((item) => item.id === cat.id)?.district ?? cat.district }}
                  side={sideFor(cat.x, size.width)}
                  nudgeX={shift.forId === cat.id ? shift.tipX : 0}
                  nudgeY={shift.forId === cat.id ? shift.tipY : 0}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
