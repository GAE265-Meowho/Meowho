import type { Metadata } from "next";
import { HqGate } from "@/components/hq/HqGate";
import "./hq.css";

// 後台不給搜尋引擎收錄；樣式只作用在 .hq-root 之內，不影響前台
export const metadata: Metadata = { title: "MeowHQ｜喵星總部", robots: { index: false, follow: false } };

export default function HqLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hq-root">
      {/* Nordic Meow 字型 Noto Sans TC 400／500／700（前台已載入 500／700，這裡補 400） */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet" />
      <HqGate>{children}</HqGate>
    </div>
  );
}
