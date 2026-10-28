"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useUi } from "./Providers";
import { useAuth } from "./Auth";

export function SiteHeader() {
  const { logo } = useUi();
  return (
    <header className="topbar">
      <div className="wrap topbar-in">
        <Link className="brand" href="/" aria-label="MeowHome 首頁">
          <img src={logo.src} alt="" />
          <span className="brand-name">MeowHome<small>貓戶・讓每隻貓都被好好記得</small></span>
        </Link>
        <nav className="mainnav" aria-label="主選單">
          <Link href="/">首頁大廳</Link>
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
    sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null)
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
          🔔{unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
        </Link>
        <Link href="/me" className="me-link" aria-label="我的貓戶">
          {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">🐱</span>}
        </Link>
      </div>
    );
  }
  return (
    <div className="top-actions">
      <button className="btn sm" data-login>貓戶註冊／登入</button>
    </div>
  );
}

export function SiteFooter() {
  const { logo } = useUi();
  return (
    <footer className="footer">
      <div className="wrap footer-in">
        <img src={logo.src} alt="" className="foot-logo" />
        <p><b>MeowHome 貓戶</b>｜溫暖陪伴、真實認養，用 AI 支持終養不棄養 🐾</p>
        <p className="fine foot-links">
          <Link href="/legal">隱私權政策與服務條款</Link>
        </p>
        <p className="fine">原型版本：部分畫面資料為示意</p>
      </div>
    </footer>
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
