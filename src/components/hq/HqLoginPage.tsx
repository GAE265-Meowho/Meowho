"use client";
import Link from "next/link";
import { HqLogo } from "./HqShell";

/** 未登入時顯示的 MeowHQ 登入頁（Google 登入，登入後回到 next） */
export function HqLoginPage({ onLogin, next, configured = true }: { onLogin: (next: string) => void; next: string; configured?: boolean }) {
  return (
    <div className="hq-center">
      <section className="hq-card">
        <HqLogo />
        <h1>喵星總部</h1>
        <p>請使用 Google 帳號登入。</p>
        <button className="hq-btn" onClick={() => onLogin(next)}>使用 Google 登入</button>
        {!configured && <p className="hq-hint">尚未連接資料庫（示範模式），無法登入。</p>}
      </section>
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
