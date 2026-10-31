"use client";
// MeowHQ 外殼：頂列（Logo、鈴鐺、頭像選單）＋側欄（手機「☰」）＋內容區（規格書 §4.0、§4.9）。
import Link from "next/link";
import { Fragment, useState } from "react";
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
  const rows = items.map(item => {
    const href = item === "home" ? HQ_HOME : isModule(item) ? HQ_MODULE_PATH[item] : HQ_HOME;
    const active = item === "home" ? activePath === HQ_HOME : activePath === href || activePath.startsWith(href + "/");
    return { item, href, active, label: item === "home" ? "首頁" : ADMIN_MODULE_LABELS[item] };
  });
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
          <ul>
            {rows.map(r => (
              <Fragment key={r.item}>
                {r.item === "admin_authorization" && <li role="separator" className="hq-sep" />}
                <li>
                  <Link href={r.href} aria-current={r.active ? "page" : undefined} className={r.active ? "on" : ""} onClick={() => setNavOpen(false)}>{r.label}</Link>
                </li>
              </Fragment>
            ))}
          </ul>
        </nav>
        {navOpen && <div className="hq-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
        <main className="hq-main">{children}</main>
      </div>
    </div>
  );
}
