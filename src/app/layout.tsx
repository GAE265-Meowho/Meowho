import type { Metadata, Viewport } from "next";
import "./site-fonts.css";
import "./globals.css";
import "./template.css";
import { Providers } from "@/components/Providers";
import { AuthProvider } from "@/components/Auth";

export const metadata: Metadata = {
  title: "Meowho喵戶",
  description: "讓每一隻貓從中途到新家立足：一句話 AI 配對、領養任務，再帶牠回家。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FBF5EA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preload" href="/fonts/site/a74fb1607b845cb0-s.p.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="site-fonts">
        <AuthProvider><Providers>{children}</Providers></AuthProvider>
      </body>
    </html>
  );
}
