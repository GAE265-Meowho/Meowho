"use client";
import Link from "next/link";

/* ---------- 歡迎建立貓戶 ---------- */
export function WelcomeHousehold({ onStart }: { onStart?: () => void }) {
  const points = [
    { ico: "🏷️", title: "幫貓戶取個名字", body: "例如「小橘之家」「北屯貓咪中途站」，這是你和貓咪們的家。" },
    { ico: "📍", title: "設定所在縣市地區", body: "每個貓戶都有自己的縣市＋區，只公開到「區」，不會顯示詳細地址。" },
    { ico: "🐱", title: "一個貓戶，很多貓咪", body: "拍照＋聊天就能幫每一隻貓建立名片，不限隻數。" },
    { ico: "🏠", title: "一個帳號兩個貓戶", body: "用 Google 帳號註冊，最多可以建立 2 個貓戶，例如自家貓和中途貓分開管理。" },
    { ico: "🏅", title: "申請中途之家認證", body: "做中途的你可以申請認證徽章，經管理員審核後會顯示在貓戶上，讓領養人更安心。" },
  ];
  return (
    <section aria-labelledby="welcomeTitle">
      <div className="welcome">
        <div>
          <h2 id="welcomeTitle" className="h2">歡迎有貓的你，為貓貓建一個家 🏠</h2>
          <p className="sub">中途之家、愛貓人士都可以建立貓戶，用聊天的方式，3 分鐘完成貓戶和第一張貓咪名片。</p>
        </div>
        <ul className="welcome-points">
          {points.map(p => (
            <li key={p.title}><span className="ico" aria-hidden="true">{p.ico}</span><div><b>{p.title}</b><p>{p.body}</p></div></li>
          ))}
        </ul>
        <div className="row-actions" style={{ justifyContent: "flex-start" }}>
          {onStart ? <button className="btn" onClick={onStart}>🏠 開始建立貓戶</button> : <Link className="btn" href="/onboarding">🏠 建立我的貓戶</Link>}
          <Link className="btn ghost" href="/me">我已經有貓戶</Link>
        </div>
      </div>
    </section>
  );
}
