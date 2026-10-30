import type { Metadata } from "next";
import { Quicksand, Zen_Maru_Gothic, Noto_Sans_TC } from "next/font/google";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import MobileTabBar from "@/components/layout/MobileTabBar";
import "./globals.css";

const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// CJK fonts are large, so skip preloading and let unicode-range split them.
const zenMaru = Zen_Maru_Gothic({
  variable: "--font-zen-maru",
  weight: ["500", "700"],
  preload: false,
});

const notoTC = Noto_Sans_TC({
  variable: "--font-noto-tc",
  weight: ["400", "500", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Meowho喵戶",
  description: "讓每一隻貓從中途到新家立足：一句話 AI 配對、7 天虛擬飼養，再帶牠回家。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-TW">
      <body className={`${quicksand.variable} ${zenMaru.variable} ${notoTC.variable}`}>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
        <MobileTabBar />
      </body>
    </html>
  );
}
