"use client";
import Link from "next/link";
import { LOGOS } from "@/lib/mock-data";

/** 登入頁卡片用網站設定的「橫式字標款」（代號 line） */
const WORDMARK = LOGOS.find(l => l.id === "line")!;

/** 品牌圖示：圓角方塊裡的貓臉（線條，非真實照片） */
function BrandMark() {
  return (
    <span className="hq-login-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 9l1-5 4 3h4l4-3 1 5c1 1.3 1.5 2.8 1.5 4.3C20.5 17.6 16.7 20 12 20s-8.5-2.4-8.5-6.7C3.5 11.8 4 10.3 5 9z" />
        <path d="M9.5 13.5h.01M14.5 13.5h.01M10.5 16c.9.7 2.1.7 3 0" />
      </svg>
    </span>
  );
}

const GoogleG = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3zM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22zM6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2zM12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z" />
  </svg>
);

/** 未登入時顯示的 MeowHQ 登入頁（#116 依 Stitch：左品牌區｜右登入卡片；Google 登入，登入後回到 next） */
export function HqLoginPage({ onLogin, next, configured = true }: { onLogin: (next: string) => void; next: string; configured?: boolean }) {
  return (
    <div className="hq-login">
      <aside className="hq-login-brand">
        <div className="hq-login-name"><BrandMark /><span>MeoWho｜喵戶總部</span></div>
        <div className="hq-login-hero">
          <span className="hq-login-chip">次世代貓星生態系</span>
          <h2>讓每隻貓都找到<br /><strong>好的人類</strong></h2>
          <p>專為高品質貓星生態系打造的次世代認養與管理平台，透過 AI 3D 虛擬互動與嚴謹審核，守護每一隻貓咪的幸福未來。</p>
        </div>
        <small>© MeoWho Administration System. All rights reserved.</small>
      </aside>
      <main className="hq-login-side">
        <section className="hq-login-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="hq-login-wordmark" src={WORDMARK.src} alt="Meowho喵戶" width={180} height={60} />
          <h1>進入總部</h1>
          <button className="hq-btn hq-login-google" onClick={() => onLogin(next)}><GoogleG />使用 Google 登入</button>
          {!configured && <p className="hq-hint">尚未連接資料庫（示範模式），無法登入。</p>}
        </section>
      </main>
    </div>
  );
}

/** 沒有權限與網址不存在共用：不透露這裡是後台 */
export function HqNotFound() {
  return (
    <div className="hq-center">
      <section className="hq-card">
        <h1>找不到頁面</h1>
        <p>你要找的頁面不存在。</p>
        <Link className="hq-btn ghost" href="/">回首頁</Link>
      </section>
    </div>
  );
}
