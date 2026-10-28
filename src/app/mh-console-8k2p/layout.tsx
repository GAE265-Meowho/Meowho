import type { Metadata } from "next";
// 後台不給搜尋引擎收錄
export const metadata: Metadata = { title: "MeowHome", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
