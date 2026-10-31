import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Free-licence cat photos (Unsplash License) are served from Unsplash's CDN.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
