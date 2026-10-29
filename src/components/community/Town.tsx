"use client";
// 喵戶小區（Issue #44）：等角小鎮，每間房子是一個貓戶；點名牌看裡面住了誰。示意資料。
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  COMMUNITY_HOUSES, ISO, ROOF_LEGEND, isoProject, paintOrder, publicLocation, roofCounts, tagWidth,
  type CommunityHouse, type RoofKind,
} from "@/lib/community";

const ROOF: Record<RoofKind, { top: string; edge: string }> = {
  waiting: { top: "#F6C453", edge: "#D79C22" },
  rescue: { top: "#EE7FA5", edge: "#C9507C" },
  normal: { top: "#FFFFFF", edge: "#D9D0C3" },
};
const WALL_L = "#EFE6D5", WALL_R = "#E2D6C2";

/** 一間房子：牆（左右兩面）＋彩色屋頂（頂面）＋屋簷 */
function House({ h, selected, onSelect }: { h: CommunityHouse; selected: boolean; onSelect: () => void }) {
  const { x, y } = isoProject(h.col, h.row);
  const w = 38, d = 19, H = 42, E = 8; // 半寬、半深、牆高、屋簷厚
  const r = ROOF[h.kind];
  const tag = tagWidth(h.name);
  const ty = y - H - E - 40;
  return (
    <g className={`town-house${selected ? " on" : ""}`}>
      <ellipse cx={x} cy={y + d + 3} rx={w + 8} ry={d + 3} fill="#5A4638" opacity=".12" />
      <polygon points={`${x - w},${y - H} ${x},${y + d - H} ${x},${y + d} ${x - w},${y}`} fill={WALL_L} />
      <polygon points={`${x},${y + d - H} ${x + w},${y - H} ${x + w},${y} ${x},${y + d}`} fill={WALL_R} />
      {/* 屋簷厚度＋屋頂頂面 */}
      <polygon points={`${x - w - 4},${y - H} ${x},${y + d + 2 - H} ${x},${y + d + 2 - H + E} ${x - w - 4},${y - H + E}`} fill={r.edge} />
      <polygon points={`${x},${y + d + 2 - H} ${x + w + 4},${y - H} ${x + w + 4},${y - H + E} ${x},${y + d + 2 - H + E}`} fill={r.edge} opacity=".85" />
      <polygon points={`${x},${y - d - 2 - H} ${x + w + 4},${y - H} ${x},${y + d + 2 - H} ${x - w - 4},${y - H}`} fill={r.top} stroke={r.edge} strokeWidth="1" />
      <line x1={x - w + 6} y1={y - H} x2={x + w - 6} y2={y - H} stroke={r.edge} strokeWidth="1.2" opacity=".5" />
      {/* 名牌（可點、可用鍵盤） */}
      <g role="button" tabIndex={0} aria-pressed={selected} aria-label={`${h.name}，${publicLocation(h)}`} className="town-tag"
        onClick={onSelect} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}>
        <rect x={x - tag / 2} y={ty} width={tag} height="30" rx="15" fill={selected ? "#3F332B" : "#FFFDF8"} stroke={selected ? "#3F332B" : "#E8D9C6"} />
        <circle cx={x - tag / 2 + 15} cy={ty + 15} r="4.5" fill={h.kind === "normal" ? "#FFFFFF" : r.top} stroke={h.kind === "normal" ? "#B9AB98" : "none"} />
        <text x={x - tag / 2 + 26} y={ty + 20} fontSize="14.5" fontWeight="700" fill={selected ? "#FFF" : "#4A3B32"}>{h.name}</text>
      </g>
    </g>
  );
}

function Tree({ col, row, s = 1 }: { col: number; row: number; s?: number }) {
  const { x, y } = isoProject(col, row);
  return (
    <g aria-hidden="true">
      <ellipse cx={x} cy={y + 6} rx={14 * s} ry={6 * s} fill="#5A4638" opacity=".12" />
      <circle cx={x} cy={y - 12 * s} r={15 * s} fill="url(#town-leaf)" />
    </g>
  );
}

export function Town() {
  const [selectedId, setSelectedId] = useState<string>("douhua");
  const houses = useMemo(() => paintOrder(COMMUNITY_HOUSES), []);
  const mapRef = useRef<HTMLDivElement>(null);
  // 手機上地圖比螢幕寬，進頁面時把小鎮中心捲到畫面中間
  useEffect(() => { const m = mapRef.current; if (m) m.scrollLeft = (m.scrollWidth - m.clientWidth) / 2; }, []);
  const counts = roofCounts(COMMUNITY_HOUSES);
  const sel = COMMUNITY_HOUSES.find(h => h.id === selectedId) ?? null;
  const corner = (c: number, r: number) => isoProject(c, r);
  const A = corner(-0.5, -0.5), B = corner(5.5, -0.5), C = corner(5.5, 5.5), D = corner(-0.5, 5.5);
  const pts = (...p: { x: number; y: number }[]) => p.map(q => `${q.x},${q.y}`).join(" ");
  const T = 26; // 地台厚度
  const river = [corner(-0.5, 3.1), corner(0.5, 3.0), corner(1.0, 4.4), corner(0.2, 5.5), corner(-0.5, 5.5)];

  return (
    <div className="town">
      <div className="town-head">
        <p className="town-kicker">🏘️ 喵戶小區</p>
        <h1>每間房子，都是一個貓戶</h1>
        <p className="sub">點房子上的名牌，看看裡面住了誰。</p>
      </div>
      <Link href="/" className="town-back">← 回首頁</Link>

      <div className="town-map" ref={mapRef}><svg className="town-svg" viewBox="40 20 720 560" role="group" aria-label="喵戶小區等角地圖">
        <defs>
          <radialGradient id="town-leaf" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#B9E6A3" /><stop offset="1" stopColor="#6DBE7B" /></radialGradient>
          <linearGradient id="town-water" x1="0" x2="1"><stop offset="0" stopColor="#8EC9E8" /><stop offset="1" stopColor="#B7DDF0" /></linearGradient>
        </defs>
        {/* 地台：側面厚度＋頂面 */}
        <polygon points={pts(D, C, { x: C.x, y: C.y + T }, { x: D.x, y: D.y + T })} fill="#D8CCB8" />
        <polygon points={pts(C, B, { x: B.x, y: B.y + T }, { x: C.x, y: C.y + T })} fill="#CBBDA6" />
        <polygon points={pts(A, B, C, D)} fill="#F4EEDF" stroke="#E4D8C4" strokeWidth="1.5" />
        <polygon points={pts(corner(0.1, 0.1), corner(5.1, 0.1), corner(5.1, 5.1), corner(0.1, 5.1))} fill="#FBF7EC" opacity=".8" />
        <polygon points={pts(...river)} fill="url(#town-water)" opacity=".9" />
        <Tree col={1.9} row={3.6} s={1.1} /><Tree col={3.9} row={1.8} /><Tree col={0.2} row={0.7} s={.9} />
        <Tree col={5.2} row={2.7} s={.9} /><Tree col={2.4} row={5.2} />
        {houses.map(h => <House key={h.id} h={h} selected={h.id === selectedId} onSelect={() => setSelectedId(h.id === selectedId ? "" : h.id)} />)}
      </svg></div>

      <div className="town-legend" aria-label="圖例">
        {ROOF_LEGEND.map(l => (
          <span key={l.kind}><i style={{ background: l.color, borderColor: l.kind === "normal" ? "#B9AB98" : l.color }} />{l.label}<b>{counts[l.kind]}</b></span>
        ))}
      </div>

      <div className="town-list" role="group" aria-label="小區住戶">
        {COMMUNITY_HOUSES.map(h => (
          <button key={h.id} type="button" className={`chip${h.id === selectedId ? " on" : ""}`} aria-pressed={h.id === selectedId} onClick={() => setSelectedId(h.id)}>
            <i style={{ background: ROOF_LEGEND.find(l => l.kind === h.kind)!.color }} aria-hidden="true" />{h.name}
          </button>
        ))}
      </div>

      {sel ? (
        <section className="town-card" aria-live="polite">
          <h2>{sel.name}</h2>
          <p className="town-loc">📍 {publicLocation(sel)}</p>
          <p>{sel.intro}</p>
          <p className="town-nums">🐱 目前照顧 <b>{sel.cats}</b> 隻{sel.waiting > 0 ? <>｜<b>{sel.waiting}</b> 隻在等新家</> : "｜目前沒有待領養的貓"}</p>
          <div className="town-actions">
            {sel.waiting > 0 && <Link className="btn sm" href="/#adopt">看看等家的貓</Link>}
            <button className="btn sm ghost" data-login>私訊 {sel.name}</button>
          </div>
        </section>
      ) : <p className="town-hint">點一間房子的名牌，這裡會顯示貓戶介紹。</p>}
      <p className="town-note">示意資料：目前小區裡的貓戶是原型示範，之後會換成真實貓戶（只顯示到縣市＋區）。</p>
    </div>
  );
}
