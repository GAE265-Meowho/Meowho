"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";

type Props = {
  /** Google 大頭貼網址（meow_profiles.avatar_url 或登入憑證的 avatar_url／picture） */
  src: string | null | undefined;
  /** 沒有網址或圖片載入失敗時顯示的內容 */
  fallback: React.ReactNode;
};

/**
 * 會員頭像。Google 的 lh3.googleusercontent.com 帶 Referer 時可能回 403、
 * 短時間大量讀取會回 429，所以不送 Referer，失敗時改顯示 fallback，不留空白圓圈。
 */
export default function AvatarImage({ src, fallback }: Props) {
  const [broken, setBroken] = useState<string | null>(null);
  useEffect(() => { setBroken(null); }, [src]); // 網址更新後重新嘗試，不要沿用上一次的失敗狀態
  if (!src || broken === src) return <>{fallback}</>;
  return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(src)} />;
}
