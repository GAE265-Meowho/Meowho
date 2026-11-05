import type { NextConfig } from "next";

/** 建置當下（Asia/Taipei）→ yyyy/mm/dd hh24:mi:ss，給 MeowHQ 頂列 version */
function hqBuildVersion(at = new Date()): string {
  const s = at.toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }); // YYYY-MM-DD HH:mm:ss
  return s.replace(/-/g, "/");
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_HQ_VERSION: process.env.NEXT_PUBLIC_HQ_VERSION || hqBuildVersion(),
  },
  images: {
    // 首頁照片（Unsplash License）直接用 Unsplash CDN，清單在 src/lib/home-photos.ts
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
