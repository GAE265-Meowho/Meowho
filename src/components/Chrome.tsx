"use client";
import { useEffect, useRef } from "react";
import { LOGOS } from "@/lib/mock-data";
import Link from "next/link";
import { useUi } from "./Providers";
import { useAuth } from "./Auth";

export function SiteHeader() {
  const { logo } = useUi();
  return (
    <header className="topbar">
      <div className="wrap topbar-in">
        <Link className="brand" href="/" aria-label="MeowHome 首頁">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo.src} alt="" />
          <span className="brand-name">MeowHome<small>貓戶・讓每隻貓都被好好記得</small></span>
        </Link>
        <nav className="mainnav" aria-label="主選單">
          <Link href="/">首頁大廳</Link>
          <Link href="/#adopt">尋找貓咪</Link>
          <Link href="/#trial">虛擬試養</Link>
          <Link href="/#feed">貓咪動態</Link>
          <Link href="/#consult">養貓知識</Link>
          <Link href="/onboarding" className="on">🏠 建立貓戶</Link>
        </nav>
        <UserArea />
      </div>
    </header>
  );
}

function UserArea() {
  const { user, profile } = useAuth();
  if (user) {
    const avatar = profile?.avatar_url ?? (user.user_metadata?.avatar_url as string | undefined);
    return (
      <div className="top-actions">
        <button className="icon-btn" aria-label="通知" data-login="通知">🔔</button>
        <Link href="/me" className="me-link" aria-label="我的貓戶">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">🐱</span>}
        </Link>
      </div>
    );
  }
  return (
    <div className="top-actions">
      <button className="btn sm" data-login>貓戶註冊/登入</button>
    </div>
  );
}

export function SiteFooter() {
  const { logo, openAdmin } = useUi();
  return (
    <footer className="footer">
      <div className="wrap footer-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo.src} alt="" className="foot-logo" />
        <p><b>MeowHome 貓戶</b>｜溫暖陪伴、真實認養，用 AI 支持終養不棄養 🐾</p>
        <p className="fine foot-links">
          <a href="#" data-proto="隱私權政策">隱私權政策</a>
          <a href="#" data-proto="服務條款">服務條款</a>
          <a href="#" onClick={e => { e.preventDefault(); openAdmin(); }}>管理者設定</a>
        </p>
        <p className="fine">原型版本：畫面資料皆為示意</p>
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

export function AdminLogoDialog() {
  const { logo, setLogo, adminOpen, closeAdmin } = useUi();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (adminOpen && !d.open) d.showModal();
    if (!adminOpen && d.open) d.close();
  }, [adminOpen]);
  return (
    <dialog ref={ref} aria-labelledby="adminTitle" onClose={closeAdmin}>
      <form method="dialog">
        <h2 id="adminTitle">管理者設定｜網站標誌</h2>
        <p className="sub">選擇後立即套用到全站（原型：存在這台瀏覽器）。</p>
        <div className="logo-pick">
          {LOGOS.map(l => (
            <button key={l.id} type="button" className="logo-opt" aria-pressed={l.id === logo.id} onClick={() => setLogo(l.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.src} alt="" />{l.name}
            </button>
          ))}
        </div>
        <div className="dlg-actions"><button className="btn" value="ok">完成</button></div>
      </form>
    </dialog>
  );
}
