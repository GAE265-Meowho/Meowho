"use client";
// MeowHQ 外殼：頂列（Logo、鈴鐺、頭像選單）＋側欄（手機「☰」）＋內容區（規格書 §4.0、§4.9）。
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useState } from "react";
import { ADMIN_MODULE_LABELS, type SidebarItem } from "@/lib/hq/types";
import { LOGOS } from "@/lib/mock-data";
import { HQ_HOME, HQ_HOUSEHOLDS, HQ_MODULE_PATH, isModule } from "./access";
import { ASSET_SECTIONS, ASSETS_CATS_HREF, assetSectionHref, isAssetSection, topSection, type AssetSection } from "./assets/hrefs";
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
  { label: "營運與社群", items: ["households", "report_moderation", "user_management"] },
  { label: "商品與知識", items: ["products", "knowledge"] },
  // virtual_assets 不是單一連結：以「虛擬體驗元件管理」為分組標題、各區塊為第一層（見 AssetsGroup；Tina 2026-11-02）
  { label: "系統", items: ["admin_authorization"] },
];

/** 側欄圖示（線條，跟頂列圖示同一組 stroke 設定） */
const NAV_ICONS: Record<SidebarItem, React.ReactNode> = {
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  households: <><path d="M3 10.5L8.5 6l5.5 4.5V19H3z" /><path d="M14 9l3.5-3 3.5 3v10h-7" /><path d="M7 19v-4h3v4" /></>,
  report_moderation: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  user_management: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3 3 0 0 1 0 6M18 14c2 .8 3 2.8 3 6" /></>,
  products: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  knowledge: <><path d="M4 5c3-1 5-1 8 1v14c-3-2-5-2-8-1z" /><path d="M20 5c-3-1-5-1-8 1v14c3-2 5-2 8-1z" /></>,
  virtual_assets: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>,
  admin_authorization: <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
};

/** 虛擬體驗元件管理各區塊的線條圖示（不用 emoji，Tina 2026-11-02） */
const SECTION_ICONS: Partial<Record<AssetSection, React.ReactNode>> = {
  cats: <><path d="M5 10l1-5 4 3h4l4-3 1 5c.9 1.2 1.3 2.6 1.3 4 0 4-3.6 6-8.3 6s-8.3-2-8.3-6c0-1.4.4-2.8 1.3-4z" /><path d="M9.5 13.5h.01M14.5 13.5h.01" /></>,
  rooms: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></>,
  food: <><path d="M3 12h18a9 6 0 0 1-18 0z" /><path d="M8 9c.5-1.5 1.5-2 3-2M13 8c1-1 2.5-1.2 3.5-.5" /></>,
  items: <><path d="M4 9h16v11H4z" /><path d="M4 9l2-5h12l2 5M10 13h4" /></>,
  others: <><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>,
  experience: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M10 9.5v5l4.5-2.5z" /></>,
};
const MENU_SECTIONS = ASSET_SECTIONS.filter(s => !("parent" in s));

/** 虛擬體驗元件管理分組（#113）：?tab= 決定目前區塊；子區塊算父區塊，平面圖的戶（/assets/floorplans/…，#138）算室內空間，其他子頁（/assets/cats/…、/assets/bases）算貓咪製作 */
function AssetsGroup({ activePath, onPick, tab }: { activePath: string; onPick: () => void; tab: string | null }) {
  const inAssets = activePath === ASSETS_CATS_HREF || activePath.startsWith(ASSETS_CATS_HREF + "/");
  const current = !inAssets ? null
    : activePath === ASSETS_CATS_HREF && isAssetSection(tab) ? topSection(tab)
    : activePath.startsWith(ASSETS_CATS_HREF + "/floorplans/") ? "rooms" : "cats";
  return (
    <ul aria-label={ADMIN_MODULE_LABELS.virtual_assets}>
      <li className="hq-navgroup" aria-hidden="true">{ADMIN_MODULE_LABELS.virtual_assets}</li>
      {MENU_SECTIONS.map(sct => (
        <li key={sct.value}>
          <Link href={assetSectionHref(sct.value)} className={current === sct.value ? "on" : ""}
            aria-current={current === sct.value ? "page" : undefined} onClick={onPick}>
            <svg {...icon}>{SECTION_ICONS[sct.value]}</svg>
            <span>{sct.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
function AssetsGroupWithQuery(props: { activePath: string; onPick: () => void }) {
  const tab = useSearchParams()?.get("tab") ?? null;
  return <AssetsGroup {...props} tab={tab} />;
}

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
    const href = item === "home" ? HQ_HOME : item === "households" ? HQ_HOUSEHOLDS : isModule(item) ? HQ_MODULE_PATH[item] : HQ_HOME;
    const active = item === "home" ? activePath === HQ_HOME : activePath === href || activePath.startsWith(href + "/");
    const label = item === "home" ? "首頁" : item === "households" ? "貓戶管理" : ADMIN_MODULE_LABELS[item];
    return { item, href, active, label };
  };
  // 依分組排；傳入但沒列在分組裡的項目放最後，避免漏掉
  const grouped = NAV_GROUPS.map(g => ({ label: g.label, rows: g.items.filter(i => items.includes(i)).map(row) })).filter(g => g.rows.length);
  const rest = items.filter(i => i !== "virtual_assets" && !NAV_GROUPS.some(g => g.items.includes(i)));
  const assetsAt = grouped.findIndex(g => g.label === "系統"); // 虛擬體驗元件管理分組放在「系統」之前
  const pick = () => setNavOpen(false);
  const assetsGroup = items.includes("virtual_assets") ? (
    // useSearchParams 需要 Suspense；載入前先顯示不帶目前標示的清單
    <Suspense fallback={<AssetsGroup activePath={activePath} onPick={pick} tab={null} />}>
      <AssetsGroupWithQuery activePath={activePath} onPick={pick} />
    </Suspense>
  ) : null;
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
            <Fragment key={g.label ?? `g${gi}`}>
              {gi === (assetsAt < 0 ? grouped.length : assetsAt) && assetsGroup}
              <ul aria-label={g.label ?? undefined}>
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
            </Fragment>
          ))}
          {assetsAt < 0 && assetsGroup}
        </nav>
        {navOpen && <div className="hq-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
        <main className="hq-main">{children}</main>
      </div>
    </div>
  );
}
