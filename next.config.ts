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
  // #456：虛擬飼養的示範影片、刷牙圖放 public/play，預設每次都要回去問一次有沒有更新；改成瀏覽器先留一小時、過期後先用舊的再背景更新（換檔後最慢一天內生效）
  async headers() {
    return [
      { source: "/play/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }] },
      // 字型檔名包含內容指紋，內容更新時需一併更換檔名。
      { source: "/fonts/site/:file(.*\\.woff2)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  images: {
    // 首頁照片（Unsplash License）直接用 Unsplash CDN，清單在 src/lib/home-photos.ts
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
