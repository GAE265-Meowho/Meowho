import type { Metadata } from "next";
import { HqGate } from "@/components/hq/HqGate";
import "./hq.css";

// 後台不給搜尋引擎收錄；樣式只作用在 .hq-root 之內，不影響前台
export const metadata: Metadata = { title: "MeoWho｜喵戶總部", robots: { index: false, follow: false } };

export default function HqLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hq-root">
      <HqGate>{children}</HqGate>
    </div>
  );
}
