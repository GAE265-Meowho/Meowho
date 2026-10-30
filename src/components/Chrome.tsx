"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useUi } from "./Providers";
import { useAuth } from "./Auth";

/** 立體小鈴鐺（SVG，不用 emoji） */
export function BellIcon({ size = 28 }: { size?: number }) {
  return (
    <svg className="bell-3d" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="bellBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD56B" /><stop offset=".55" stopColor="#F6B53B" /><stop offset="1" stopColor="#D98A12" />
        </linearGradient>
        <radialGradient id="bellClap" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#FFE9A8" /><stop offset="1" stopColor="#C9701F" /></radialGradient>
      </defs>
      <ellipse cx="16" cy="29" rx="7" ry="1.6" fill="#7A4726" opacity=".18" />
      <circle cx="16" cy="4.5" r="2.2" fill="#D98A12" />
      <path d="M16 6c-5.2 0-8.6 3.9-8.6 9.2 0 4.1-1.2 6.2-3 8 -.5.5-.1 1.3.6 1.3h22c.7 0 1.1-.8.6-1.3-1.8-1.8-3-3.9-3-8C24.6 9.9 21.2 6 16 6z" fill="url(#bellBody)" stroke="#C9701F" strokeWidth="1" />
      <path d="M11 11.5c1-2 2.6-3.2 4.6-3.6" fill="none" stroke="#FFF6D6" strokeWidth="1.8" strokeLinecap="round" opacity=".85" />
      <circle cx="16" cy="25.6" r="2.6" fill="url(#bellClap)" stroke="#C9701F" strokeWidth=".8" />
    </svg>
  );
}

export function SiteHeader() {
  const { logo } = useUi();
  return (
    <header className="topbar">
      <div className="wrap topbar-in">
        <Link className="brand" href="/" aria-label="Meowho喵戶 首頁">
          <img src={logo.src} alt="" />
          <span className="brand-name">Meowho喵戶<small>讓每隻貓都找到好的家</small></span>
        </Link>
        <nav className="mainnav" aria-label="主選單">
          <Link href="/">首頁大廳</Link>
          <Link href="/community">喵戶小區</Link>
          <Link href="/#adopt">尋找貓咪</Link>
          <Link href="/#trial">虛擬試養</Link>
          <Link href="/#feed">貓咪動態</Link>
          <Link href="/#consult">養貓知識</Link>
        </nav>
        <UserArea />
      </div>
    </header>
  );
}

/** 未讀通知數（Realtime 之後再接；目前在載入頁面時更新） */
function useUnreadCount(userId: string | undefined) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb || !userId) return;
    sb.from("meow_notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null)
      .then(({ count }) => setN(count ?? 0));
  }, [userId]);
  return n;
}

function UserArea() {
  const { user, profile } = useAuth();
  const unread = useUnreadCount(user?.id);
  if (user) {
    const avatar = profile?.avatar_url ?? (user.user_metadata?.avatar_url as string | undefined);
    return (
      <div className="top-actions">
        <Link href="/notifications" className="icon-btn bell" aria-label={`通知${unread ? `，${unread} 則未讀` : ""}`}>
          <BellIcon />{unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
        </Link>
        <Link href="/me" className="me-link" aria-label="我的貓戶">
          {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">🐱</span>}
        </Link>
      </div>
    );
  }
  return (
    <div className="top-actions">
      <button className="btn btn-cat" data-login>登入／建立貓戶
        <span className="tail" aria-hidden="true">
          <svg viewBox="0 0 30 34"><path d="M2 8c10-4 22 2 24 13 1.5 7-3 11-9 11" fill="none" stroke="#E8913A" strokeWidth="9" strokeLinecap="round" /><path d="M2 8c10-4 22 2 24 13 1.5 7-3 11-9 11" fill="none" stroke="#C9701F" strokeWidth="1" strokeLinecap="round" opacity=".0" /><path d="M17 12.5l9 3M18.5 20l8.5 1.5" stroke="#FFF" strokeWidth="2" strokeLinecap="round" opacity=".9" /></svg>
        </span>
      </button>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap footer-in">
        <span><b>Meowho喵戶</b>｜用 AI 支持終養不棄養 🐾</span>
        <Link href="/legal">隱私權政策與服務條款</Link>
        <span>原型版本：部分畫面資料為示意</span>
      </div>
    </footer>
  );
}

/** 條款等內頁的標題列：站台 LOGO＋頁面名稱 */
export function PageBrandTitle({ title }: { title: string }) {
  const { logo } = useUi();
  return (
    <div className="page-brand">
      <img src={logo.src} alt="Meowho喵戶 標誌" />
      <div><span className="page-brand-name">Meowho喵戶</span><h1>{title}</h1></div>
    </div>
  );
}

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="手機導覽">
      <Link href="/"><span aria-hidden="true">🐾</span>首頁大廳</Link>
      <Link href="/#adopt"><span aria-hidden="true">🔍</span>尋找貓咪</Link>
      <Link href="/onboarding" className="on"><span aria-hidden="true">➕</span>建立貓戶</Link>
      <Link href="/#feed"><span aria-hidden="true">📷</span>貓咪動態</Link>
      <Link href="/me"><span aria-hidden="true">🏠</span>我的貓戶</Link>
    </nav>
  );
}
