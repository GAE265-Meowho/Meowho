"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { cats } from "@/lib/cats";
import { households, isoProject, labelWidth, paintOrder, ROOF_LEGEND, type Household, type RoofKind } from "@/lib/households";
import styles from "./adoptMap.module.css";

const ROOF: Record<RoofKind, { top: string; edge: string }> = {
  waiting: { top: "#f6b53b", edge: "#d99520" },
  fresh: { top: "#f4a7a1", edge: "#d9776f" },
  normal: { top: "#ffffff", edge: "#d9cbb4" },
};
const WALL_L = "#fff6e6";
const WALL_R = "#f1e2c8";

const pts = (...p: { x: number; y: number }[]) => p.map((q) => `${q.x},${q.y}`).join(" ");

/** A straight road band across the board, at a fixed row (axis "row") or column. */
function Road({ axis, at }: { axis: "row" | "col"; at: number }) {
  const w = 0.2;
  const c = (a: number, b: number) => (axis === "row" ? isoProject(a, b) : isoProject(b, a));
  const s = c(-0.5, at);
  const e = c(5.5, at);
  return (
    <g aria-hidden>
      <polygon points={pts(c(-0.5, at - w), c(5.5, at - w), c(5.5, at + w), c(-0.5, at + w))} fill="#f1e4cc" />
      <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke="#fffaf0" strokeWidth="2.5" strokeDasharray="10 10" />
    </g>
  );
}

function Tree({ col, row, s = 1 }: { col: number; row: number; s?: number }) {
  const { x, y } = isoProject(col, row);
  return (
    <g aria-hidden>
      <ellipse cx={x} cy={y + 5} rx={13 * s} ry={5.5 * s} fill="#7a4a26" opacity=".1" />
      <rect x={x - 2} y={y - 8 * s} width="4" height={10 * s} rx="2" fill="#c9a77a" />
      <circle cx={x} cy={y - 16 * s} r={13 * s} fill="#a9d29b" />
      <circle cx={x - 4 * s} cy={y - 20 * s} r={5 * s} fill="#c5e3b6" />
    </g>
  );
}

function House({ h, selected, dim, onSelect }: { h: Household; selected: boolean; dim: boolean; onSelect: () => void }) {
  const { x, y } = isoProject(h.col, h.row);
  const w = 36;
  const d = 18;
  const H = 40;
  const E = 7;
  const r = ROOF[h.kind];
  const count = h.waiting.length;
  const nameW = labelWidth(h.name);
  const badgeW = count ? 54 : 0;
  const tagW = 34 + nameW + badgeW;
  const ty = y - H - E - 44;
  const tx = x - tagW / 2;

  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${h.name}，${h.district}${count ? `，${count} 隻貓在等家` : ""}`}
      className={[styles.house, selected && styles.on, dim && styles.dim, count === 0 && styles.quiet].filter(Boolean).join(" ")}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <g className={styles.body}>
        <ellipse cx={x} cy={y + d + 2} rx={w + 8} ry={d + 3} fill="#7a4a26" opacity=".1" />
        <polygon points={`${x - w},${y - H} ${x},${y + d - H} ${x},${y + d} ${x - w},${y}`} fill={WALL_L} />
        <polygon points={`${x},${y + d - H} ${x + w},${y - H} ${x + w},${y} ${x},${y + d}`} fill={WALL_R} />
        {/* window on the left wall, arched door on the right wall */}
        <polygon points={`${x - w + 9},${y - H + 16} ${x - w + 21},${y - H + 22} ${x - w + 21},${y - H + 33} ${x - w + 9},${y - H + 27}`} fill="#fde9c0" />
        <path d={`M${x + 12} ${y + d - 6} v-14 a7 7 0 0 1 12 -6 v14 Z`} fill={h.kind === "waiting" ? "#f6b53b" : "#e7d3b3"} />
        {/* eave thickness + roof */}
        <polygon points={`${x - w - 4},${y - H} ${x},${y + d + 2 - H} ${x},${y + d + 2 - H + E} ${x - w - 4},${y - H + E}`} fill={r.edge} />
        <polygon points={`${x},${y + d + 2 - H} ${x + w + 4},${y - H} ${x + w + 4},${y - H + E} ${x},${y + d + 2 - H + E}`} fill={r.edge} opacity=".85" />
        <polygon points={`${x},${y - d - 2 - H} ${x + w + 4},${y - H} ${x},${y + d + 2 - H} ${x - w - 4},${y - H}`} fill={r.top} stroke={r.edge} strokeWidth="1" />
      </g>

      {/* Name tag: always shown for houses with cats waiting; others reveal on hover / select */}
      <g className={styles.tag}>
        <path d={`M${x - 6} ${ty + 30} L${x} ${ty + 37} L${x + 6} ${ty + 30} Z`} className={styles.tagFill} />
        <rect x={tx} y={ty} width={tagW} height="31" rx="15.5" className={styles.tagFill} />
        <circle cx={tx + 16} cy={ty + 15.5} r="5" fill={r.top} stroke={r.edge} strokeWidth="1.2" />
        <text x={tx + 27} y={ty + 20.5} fontSize="14" fontWeight="700" className={styles.tagText}>
          {h.name}
        </text>
        {count > 0 && (
          <g>
            <rect x={tx + 30 + nameW} y={ty + 5} width={badgeW - 4} height="21" rx="10.5" fill="#f6b53b" />
            <text x={tx + 28 + nameW + badgeW / 2} y={ty + 20} fontSize="12" fontWeight="700" textAnchor="middle" fill="#3f2e24">
              等家 {count}
            </text>
          </g>
        )}
      </g>
    </g>
  );
}

type Props = {
  /** Whether a waiting cat passes the current personality filter. */
  matches: (catName: string) => boolean;
  onShowCard: (catName: string) => void;
};

/** 貓緣小鎮-style isometric map: every house is a 喵戶; tags only where cats are waiting. */
export default function AdoptMap({ matches, onShowCard }: Props) {
  const [selectedId, setSelectedId] = useState("xiaoqing");
  const ordered = useMemo(() => paintOrder(households), []);
  const mapRef = useRef<HTMLDivElement>(null);

  // On phones the map is wider than the screen: start with the town centred.
  useEffect(() => {
    const m = mapRef.current;
    if (m) m.scrollLeft = (m.scrollWidth - m.clientWidth) / 2;
  }, []);
  const sel = households.find((h) => h.id === selectedId) ?? null;
  const selCats = sel ? cats.filter((c) => sel.waiting.includes(c.name)) : [];

  const c = isoProject;
  const A = c(-0.5, -0.5);
  const B = c(5.5, -0.5);
  const C = c(5.5, 5.5);
  const D = c(-0.5, 5.5);
  const T = 24;
  const river = [c(-0.5, 3.7), c(0.2, 3.95), c(0.75, 4.8), c(0.4, 5.5), c(-0.5, 5.5)];
  const plaza = c(3, 2);

  return (
    <div className={styles.wrap}>
      <div className={styles.mapCard}>
        <div className={styles.map} ref={mapRef}>
          <svg viewBox="30 96 740 418" role="group" aria-label="帶我回家地圖：台中市的喵戶">
            {/* platform */}
            <polygon points={pts(D, C, { x: C.x, y: C.y + T }, { x: D.x, y: D.y + T })} fill="#efd9b4" />
            <polygon points={pts(C, B, { x: B.x, y: B.y + T }, { x: C.x, y: C.y + T })} fill="#e5c995" />
            <polygon points={pts(A, B, C, D)} fill="#fbf1dd" stroke="#efdcbc" strokeWidth="1.5" />
            <polygon points={pts(...river)} fill="#b9dde6" />
            <Road axis="row" at={2} />
            <Road axis="col" at={3} />
            {/* little plaza where the roads cross */}
            <ellipse cx={plaza.x} cy={plaza.y} rx="40" ry="20" fill="#e6f1d8" stroke="#cfe3bd" />
            <Tree col={3} row={2} s={0.9} />
            <Tree col={0.4} row={1.8} />
            <Tree col={2.6} row={0.3} s={0.9} />
            <Tree col={5.1} row={3.1} s={1.05} />
            <Tree col={1.3} row={5.2} s={0.9} />
            <Tree col={5.2} row={5.0} s={0.85} />
            {ordered.map((h) => {
              const waitingMatch = h.waiting.some(matches);
              return (
                <House
                  key={h.id}
                  h={h}
                  selected={h.id === selectedId}
                  dim={h.waiting.length > 0 && !waitingMatch}
                  onSelect={() => setSelectedId(h.id)}
                />
              );
            })}
          </svg>
        </div>

        <ul className={styles.legend} aria-label="圖例">
          {ROOF_LEGEND.map((l) => (
            <li key={l.kind}>
              <i style={{ background: ROOF[l.kind].top, borderColor: ROOF[l.kind].edge }} />
              {l.label}
            </li>
          ))}
        </ul>
      </div>

      <aside className={styles.panel} aria-live="polite">
        {sel ? (
          <>
            <p className={styles.kind} data-kind={sel.kind}>
              {ROOF_LEGEND.find((l) => l.kind === sel.kind)!.label}
            </p>
            <h3>{sel.name}</h3>
            <p className={styles.meta}>
              <Icon name="pin" size={14} />
              {sel.district}・喵戶長 {sel.owner}
            </p>
            <p className={styles.intro}>{sel.intro}</p>

            {selCats.length > 0 ? (
              <>
                <p className={styles.sub}>在這裡等家的貓</p>
                <ul className={styles.cats}>
                  {selCats.map((cat) => (
                    <li key={cat.name} className={matches(cat.name) ? undefined : styles.catDim}>
                      <span className={styles.thumb}>
                        <Image src={cat.photo.src} alt={cat.photo.alt} fill sizes="56px" />
                      </span>
                      <span className={styles.catText}>
                        <strong>{cat.name}</strong>
                        <small>
                          {cat.sex}｜{cat.age}・等家 {cat.waitDays} 天
                        </small>
                        <small>{cat.tags.slice(0, 2).join("・")}</small>
                      </span>
                      <button type="button" className={styles.showCard} onClick={() => onShowCard(cat.name)}>
                        看名片
                      </button>
                    </li>
                  ))}
                </ul>
                <CatButton href="/#trial" size="sm">
                  跟牠開始 7 天虛擬飼養
                </CatButton>
              </>
            ) : (
              <p className={styles.none}>這個喵戶目前沒有等家的貓。</p>
            )}

            <blockquote className={styles.latest}>
              <small>最新日記</small>「{sel.latest}」
            </blockquote>
            {/* 示意資料。公開位置只能到「縣市＋區」（FR-02-07），不要顯示更細的地址。 */}
          </>
        ) : (
          <p className={styles.none}>點地圖上的房子，看看裡面住了誰。</p>
        )}
      </aside>
    </div>
  );
}
