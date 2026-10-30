import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./template.css";
import { Providers } from "@/components/Providers";
import { AuthProvider } from "@/components/Auth";

export const metadata: Metadata = {
  title: "Meowho喵戶",
  description: "中途之家、愛貓人士與想領養的人一起記錄、交流與相遇的貓社群。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFDF5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=Zen+Maru+Gothic:wght@500;700&family=Noto+Sans+TC:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AuthProvider><Providers>{children}</Providers></AuthProvider>
      </body>
    </html>
  );
}
