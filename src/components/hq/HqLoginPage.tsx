"use client";
import Link from "next/link";
import { LOGOS } from "@/lib/mock-data";

/** 登入頁卡片用網站設定的「橫式字標款」（代號 line） */
const WORDMARK = LOGOS.find(l => l.id === "line")!;

/** 左上角品牌標誌：網站內建的「圓形花貓款」（代號 round；#116 Tina 指定用喵戶 logo） */
const ROUND = LOGOS.find(l => l.id === "round")!;

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
        <div className="hq-login-name">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="hq-login-mark" src={ROUND.src} alt="Meowho喵戶" width={56} height={56} />
          {/* Tina 2026-11-02：喵戶 logo 後面只留「總部」 */}
          <span>總部</span>
        </div>
        <div className="hq-login-hero">
          <span className="hq-login-chip">AI喵寶生態系</span>
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
          {/* 不必先是喵戶會員：第一次用 Google 登入會自動建立帳號（meow_profiles 由 Auth 建立）；要由系統管理員授權後才看得到後台 */}
          <p className="hq-login-lead">不需要先加入喵戶，直接用 Google 帳號登入或註冊。</p>
          <button className="hq-btn hq-login-google" onClick={() => onLogin(next)}><GoogleG />使用 Google 登入／註冊</button>
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
