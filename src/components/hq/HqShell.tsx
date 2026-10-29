"use client";
/* eslint-disable @next/next/no-img-element */
// MeowHQ 外殼：頂列（Logo、鈴鐺、頭像選單）＋側欄（手機「☰」）＋內容區（規格書 §4.0、§4.9）。
import Link from "next/link";
import { Fragment, useState } from "react";
import { ADMIN_MODULE_LABELS, type SidebarItem } from "@/lib/hq/types";
import { HQ_HOME, HQ_MODULE_PATH, isModule } from "./access";
import { HqOfflineBanner } from "./HqStates";

export interface HqUser { name: string; roleLabel: string; avatarUrl?: string | null }
interface Props {
  items: SidebarItem[]; user: HqUser; unread: number; onLogout: () => void; activePath: string; children: React.ReactNode;
}

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, width: 20, height: 20, viewBox: "0 0 24 24" } as const;

export function HqLogo() {
  return (
    <Link href={HQ_HOME} className="hq-logo" aria-label="MeowHQ 首頁">
      <svg viewBox="0 0 40 12" width="40" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 11 8 2l6 5M34 11 32 2l-6 5" />
      </svg>
      <span>MeowHQ</span>
    </Link>
  );
}

export function HqShell({ items, user, unread, onLogout, activePath, children }: Props) {
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
        <button className="hq-iconbtn hq-bell" aria-label={`通知${unread ? `，${unread} 則未讀` : ""}`}>
          <svg {...icon}><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4" /></svg>
          {unread > 0 && <span className="hq-badge">{unread > 99 ? "99+" : unread}</span>}
        </button>
        <div className="hq-menu-wrap">
          <button className="hq-avatar" aria-label="帳號選單" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.name.slice(0, 1)}
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
