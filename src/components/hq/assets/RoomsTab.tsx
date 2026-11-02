"use client";
// 室內空間（#113，Tina 2026-11-02）：用大卡片進入「寶麗來轉換」「平面圖轉換」，左側選單不做子選單。兩者目前都是規劃中。
import Link from "next/link";
import { assetSectionHref } from "./hrefs";

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, width: 36, height: 36, viewBox: "0 0 24 24" } as const;

const CARDS = [
  {
    value: "rooms-polaroid", title: "寶麗來轉換", desc: "把房間的寶麗來（拍立得）照片轉成 3D 室內場景。",
    art: <><rect x="4" y="3" width="16" height="18" rx="2" /><rect x="6.5" y="5.5" width="11" height="10" rx="1" /><path d="M6.5 13l3-3 3 3 2-2 3 3" /></>,
  },
  {
    value: "rooms-floorplan", title: "平面圖轉換", desc: "把房屋平面圖轉成可以走動的 3D 室內空間。",
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
          <span className="hq-tag warn">規劃中</span>
        </Link>
      ))}
    </div>
  );
}
