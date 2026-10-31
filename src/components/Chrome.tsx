"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import CatPerch from "@/components/journey/CatPerch";
import CatButton from "@/components/ui/CatButton";
import AvatarImage from "@/components/ui/AvatarImage";
import Icon from "@/components/ui/Icon";
import { mainNav, tabNav } from "@/components/layout/nav";
import styles from "@/components/layout/layout.module.css";
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

// 版型照 docs/design/DESIGN.md v2（原型 prototypes/meowwho-v2）；LOGO 仍由後台設定（useUi().logo）
export function SiteHeader() {
  const { logo } = useUi();
  return (
    <header className={styles.header}>
      <div className={`wrap ${styles.headerInner}`}>
        <Link href="/" className={styles.logo} aria-label="Meowho喵戶 首頁">
          <img className={styles.logoImg} src={logo.src} alt="" />
          <span>
            <strong>Meowho</strong>
            <small>喵戶・讓每隻貓都找到好的家</small>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="主選單">
          {mainNav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
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
  const { user, profile, configured, login } = useAuth();
  const { toast } = useUi();
  const unread = useUnreadCount(user?.id);
  if (user) {
    const meta = user.user_metadata ?? {};
    const avatar = profile?.avatar_url ?? (meta.avatar_url as string | undefined) ?? (meta.picture as string | undefined);
    return (
      <div className={styles.userArea}>
        <Link href="/notifications" className={styles.iconBtn} aria-label={`通知${unread ? `，${unread} 則未讀` : ""}`}>
          <BellIcon />{unread > 0 && <span className={styles.badge}>{unread > 99 ? "99+" : unread}</span>}
        </Link>
        <Link href="/me" className={styles.avatar} aria-label="我的喵戶">
          <AvatarImage src={avatar} fallback={<Icon name="cat" size={22} />} />
        </Link>
      </div>
    );
  }
  return (
    <CatButton size="sm" className={styles.login} onClick={() => (configured ? void login() : toast("登入功能尚未設定（需要 Supabase 環境變數）"))}>
      <span className={styles.ctaFull}>登入／建立喵戶</span>
      <span className={styles.ctaShort}>登入</span>
    </CatButton>
  );
}

/** 首頁 3D 橘子一路走到頁尾的終點：新家門口；其他頁沒有 CatJourney，這個 perch 只是看不見的定位點 */
function NewHome() {
  return (
    <div className={styles.newHome} aria-hidden>
      <svg viewBox="0 0 260 150">
        <path d="M30 70 130 6l100 64v74a6 6 0 0 1-6 6H36a6 6 0 0 1-6-6Z" fill="#fff" />
        <path d="M14 78 130 2l116 76-10 12L130 22 24 90Z" fill="var(--orange)" />
        <rect x="58" y="78" width="44" height="36" rx="6" fill="var(--yellow-soft)" />
        <path d="M80 78v36M58 96h44" stroke="#fff" strokeWidth="4" />
        <rect x="150" y="80" width="50" height="70" rx="25" fill="var(--yellow)" />
        <circle cx="188" cy="118" r="3.5" fill="var(--orange-deep)" />
      </svg>
      <span className={styles.doorstep} />
      <CatPerch action="sleep" label="到新家了，睡得好安心" className={styles.homePerch} />
    </div>
  );
}

// 首頁照片為 Unsplash License（不需標示來源），來源清單在 src/lib/home-photos.ts
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <NewHome />
      <div className="wrap">
        <p className={styles.footerBrand}>
          <Icon name="cat" size={22} />
          <strong>Meowho喵戶</strong>｜用 AI 支持終養不棄養
        </p>
        <p className={styles.footerMeta}>
          <Link href="/legal">隱私權政策與服務條款</Link>
        </p>
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
    <nav className={styles.tabbar} aria-label="手機選單">
      {tabNav.map((item) => (
        <Link key={item.href} href={item.href} className={item.href === "/onboarding" ? styles.tabMain : undefined}>
          <span className={styles.tabIcon}>
            <Icon name={item.icon} size={22} />
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
