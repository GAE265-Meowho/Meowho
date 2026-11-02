"use client";
// MeowHQ 外殼：頂列（Logo、鈴鐺、頭像選單）＋側欄（手機「☰」）＋內容區（規格書 §4.0、§4.9）。
import Link from "next/link";
import { useState } from "react";
import { ADMIN_MODULE_LABELS, type SidebarItem } from "@/lib/hq/types";
import { LOGOS } from "@/lib/mock-data";
import { HQ_HOME, HQ_MODULE_PATH, isModule } from "./access";
import { HqOfflineBanner } from "./HqStates";
import { NotificationBell } from "./NotificationBell";
import AvatarImage from "@/components/ui/AvatarImage";

/** 後台頂列固定用網站設定的「橫式字標款」（代號 line） */
const HQ_WORDMARK = LOGOS.find(l => l.id === "line")!;

export interface HqUser { name: string; roleLabel: string; avatarUrl?: string | null }
interface Props {
  items: SidebarItem[]; user: HqUser; unread: number; onLogout: () => void; activePath: string; children: React.ReactNode;
  /** 鈴鐺讀取自己通知用；標為已讀後呼叫 onNotificationsChanged 重新計算未讀數 */
  userId?: string | null; onNotificationsChanged?: () => void;
}

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, width: 20, height: 20, viewBox: "0 0 24 24" } as const;

/** 側欄分組（#113，依 Stitch「MeowHQ Cat Model Builder」）：首頁不分組；沒有可見項目的分組不顯示 */
const NAV_GROUPS: { label: string | null; items: SidebarItem[] }[] = [
  { label: null, items: ["home"] },
  { label: "營運與社群", items: ["report_moderation", "user_management"] },
  { label: "商品與知識", items: ["products", "knowledge"] },
  { label: "虛擬與科技體驗", items: ["virtual_assets"] },
  { label: "系統", items: ["admin_authorization"] },
];

/** 側欄圖示（線條，跟頂列圖示同一組 stroke 設定） */
const NAV_ICONS: Record<SidebarItem, React.ReactNode> = {
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  report_moderation: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  user_management: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3 3 0 0 1 0 6M18 14c2 .8 3 2.8 3 6" /></>,
  products: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  knowledge: <><path d="M4 5c3-1 5-1 8 1v14c-3-2-5-2-8-1z" /><path d="M20 5c-3-1-5-1-8 1v14c3-2 5-2 8-1z" /></>,
  virtual_assets: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>,
  admin_authorization: <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
};

export function HqLogo() {
  return (
    <Link href={HQ_HOME} className="hq-logo" aria-label="管理者介面首頁">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hq-logo-mark" src={HQ_WORDMARK.src} alt="" width={160} height={40} />
      <span className="hq-logo-text">
        <span className="hq-logo-title">管理者介面</span>
        <span className="hq-logo-sub">Administrator Interface</span>
      </span>
    </Link>
  );
}

export function HqShell({ items, user, unread, onLogout, activePath, children, userId, onNotificationsChanged }: Props) {
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const row = (item: SidebarItem) => {
    const href = item === "home" ? HQ_HOME : isModule(item) ? HQ_MODULE_PATH[item] : HQ_HOME;
    const active = item === "home" ? activePath === HQ_HOME : activePath === href || activePath.startsWith(href + "/");
    return { item, href, active, label: item === "home" ? "首頁" : ADMIN_MODULE_LABELS[item] };
  };
  // 依分組排；傳入但沒列在分組裡的項目放最後，避免漏掉
  const grouped = NAV_GROUPS.map(g => ({ label: g.label, rows: g.items.filter(i => items.includes(i)).map(row) })).filter(g => g.rows.length);
  const rest = items.filter(i => !NAV_GROUPS.some(g => g.items.includes(i)));
  if (rest.length) grouped.push({ label: null, rows: rest.map(row) });
  return (
    <div className="hq-app">
      <header className="hq-top">
        <button className="hq-iconbtn hq-burger" aria-label="選單" aria-expanded={navOpen} aria-controls="hq-sidebar" onClick={() => setNavOpen(o => !o)}>
          <svg {...icon}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <HqLogo />
        <div className="hq-grow" />
        <NotificationBell unread={unread} userId={userId} onChanged={onNotificationsChanged} />
        <div className="hq-menu-wrap">
          <button className="hq-avatar" aria-label="帳號選單" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
            <AvatarImage src={user.avatarUrl} fallback={user.name.slice(0, 1)} />
          </button>
          {menuOpen && (
            <div className="hq-menu" role="menu">
              <div className="hq-menu-info"><strong>{user.name}</strong><span>{user.roleLabel}</span></div>
              <button role="menuitem" onClick={onLogout}>登出</button>
            </div>
          )}
        </div>
      </header>
      <HqOfflineBanner />
      <div className="hq-body">
        <nav id="hq-sidebar" className={`hq-side${navOpen ? " open" : ""}`} aria-label="後台導覽">
          {grouped.map((g, gi) => (
            <ul key={g.label ?? `g${gi}`} aria-label={g.label ?? undefined}>
              {g.label && <li className="hq-navgroup" aria-hidden="true">{g.label}</li>}
              {g.rows.map(r => (
                <li key={r.item}>
                  <Link href={r.href} aria-current={r.active ? "page" : undefined} className={r.active ? "on" : ""} onClick={() => setNavOpen(false)}>
                    <svg {...icon}>{NAV_ICONS[r.item]}</svg>
                    <span>{r.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </nav>
        {navOpen && <div className="hq-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
        <main className="hq-main">{children}</main>
      </div>
    </div>
  );
}
