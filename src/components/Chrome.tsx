"use client";
import { useEffect, useRef } from "react";
import { LOGOS } from "@/lib/mock-data";
import { useUi } from "./Providers";

export function SiteHeader() {
  const { logo } = useUi();
  return (
    <header className="topbar">
      <div className="wrap topbar-in">
        <a className="brand" href="#top" aria-label="MeowHome 首頁">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo.src} alt="" />
          <span className="brand-name">MeowHome<small>貓戶・讓每隻貓都被好好記得</small></span>
        </a>
        <nav className="mainnav" aria-label="主選單">
          <a href="#top" className="on">首頁大廳</a>
          <a href="#adopt">尋找貓咪</a>
          <a href="#trial">虛擬試養</a>
          <a href="#feed">貓咪動態</a>
          <a href="#consult">養貓知識</a>
        </nav>
        <div className="top-actions">
          <button className="icon-btn" aria-label="通知" data-login>🔔</button>
          <button className="btn sm" data-login>Google 登入</button>
        </div>
      </div>
    </header>
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
      <a href="#top" className="on"><span aria-hidden="true">🐾</span>首頁大廳</a>
      <a href="#adopt"><span aria-hidden="true">🔍</span>尋找貓咪</a>
      <a href="#trial"><span aria-hidden="true">🧶</span>虛擬試養</a>
      <a href="#feed"><span aria-hidden="true">📷</span>貓咪動態</a>
      <a href="#" data-login><span aria-hidden="true">🏠</span>我的貓戶</a>
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
