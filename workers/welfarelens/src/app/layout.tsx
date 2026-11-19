import type { Metadata } from "next";
import "./globals.css";
import "./health-check-theme.css";
import ModeShell from '../components/ModeShell';
export const metadata: Metadata = {
  title: "貓咪居家環境健檢",
  description: "透過 AI 了解可見的居家照護條件，找出值得改善的地方，建立可執行的照護計畫。",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body className="welfarelens-theme"><ModeShell>{children}</ModeShell></body>
    </html>
  );
}
