"use client";
// 室內空間（#113，Tina 2026-11-02）：用大卡片進入各轉換區塊，左側選單不做子選單。影片轉換（#93）、平面圖轉換（#138）。
import Link from "next/link";
import { assetSectionHref } from "./hrefs";

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, width: 36, height: 36, viewBox: "0 0 24 24" } as const;

const CARDS = [
  {
    value: "rooms-video", title: "影片轉換", desc: "把手機拍的房間影片轉成 3D 室內場景。", ready: true,
    art: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>,
  },
  {
    value: "rooms-floorplan", title: "平面圖轉換", desc: "把房屋平面圖轉成可以走動的 3D 室內空間。", ready: true,
    art: <><rect x="3" y="3" width="18" height="18" rx="1.5" /><path d="M3 12h7M10 3v5M10 12v9M14 12h7M14 12V8" /></>,
  },
] as const;

export function RoomsTab() {
  return (
    <div className="hq-roomcards" role="group" aria-label="室內空間">
      {CARDS.map(c => (
        <Link key={c.value} href={assetSectionHref(c.value)} className="hq-roomcard">
          <span className="hq-roomcard-art"><svg {...icon}>{c.art}</svg></span>
          <span className="hq-roomcard-body">
            <strong>{c.title}</strong>
            <span>{c.desc}</span>
          </span>
          {!("ready" in c) && <span className="hq-tag warn">規劃中</span>}
        </Link>
      ))}
    </div>
  );
}
