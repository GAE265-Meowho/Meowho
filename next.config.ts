import type { NextConfig } from "next";

/** Asia/Taipei → yyyy/mm/dd hh24:mi:ss（與 src/lib/hq/build-meta.ts 同格式） */
function formatHqVersionDate(at = new Date()): string {
  return at.toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).replace(/-/g, "/");
}

/** 頁尾主要來自 page-meta.generated.json；此處僅作缺 key／本機無 git 時的 fallback */
const hqVersion = process.env.NEXT_PUBLIC_HQ_VERSION || formatHqVersionDate();
const hqUpdatedBy =
  process.env.NEXT_PUBLIC_HQ_UPDATED_BY
  || process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME
  || process.env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN
  || process.env.GITHUB_ACTOR
  || "unknown";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_HQ_VERSION: hqVersion,
    NEXT_PUBLIC_HQ_UPDATED_BY: hqUpdatedBy,
  },
  images: {
    // 首頁照片（Unsplash License）直接用 Unsplash CDN，清單在 src/lib/home-photos.ts
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
