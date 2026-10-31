import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 首頁照片（Unsplash License）直接用 Unsplash CDN，清單在 src/lib/home-photos.ts
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
