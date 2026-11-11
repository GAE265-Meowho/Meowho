import type { MetadataRoute } from "next";

// #361 網頁圖示組（加到手機主畫面時用）：深可可底配蜂蜜黃門口貓頭；favicon 與 apple-icon 放在 src/app/ 由 Next.js 自動帶入
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meowho喵戶",
    short_name: "Meowho",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf5ea",
    theme_color: "#3f2e24",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
