"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRef, useState } from "react";
import { CATS, DEFAULT_CITY } from "@/lib/mock-data";
import { matchCats } from "@/lib/match";
import { photo } from "@/lib/photos";
import { useUi } from "./Providers";

const EXAMPLES = ["上班族，白天不在家，想要獨立一點的貓", "家裡有小孩，想找溫和的貓", "可以照顧需要特別照護的貓"];

/** 首頁最上方：你今天想做什麼？（建立貓戶／新貓入戶／我想領養） */
export function Intent() {
  const goSearch = () => {
    const q = document.getElementById("q");
    q?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => q?.focus(), 400);
  };
  return (
    <section className="intent-section" aria-labelledby="intentTitle">
      <div className="wrap intent">
        <h1 id="intentTitle" className="bubble intent-ask">喵～你今天想做什麼呢？</h1>
        <div className="intent-options">
          <Link href="/onboarding" className="intent-btn peach">
            <span className="ico" aria-hidden="true">🏠</span>
            <span><b>我想建立貓戶，給貓貓一個家</b><small>有貓的你，幫貓戶取個名字、設定所在縣市地區，就能把每一隻貓都放進來</small></span>
          </Link>
          <Link href="/onboarding?cat=1" className="intent-btn butter">
            <span className="ico" aria-hidden="true">🐱</span>
            <span><b>新貓入戶</b><small>已經有貓戶了？拍張照、聊幾句，幫新來的貓咪建立名片</small></span>
          </Link>
          <button type="button" className="intent-btn mint" onClick={goSearch}>
            <span className="ico" aria-hidden="true">💖</span>
            <span><b>我想領養貓貓</b><small>用一句話說說你的生活，幫你找合得來的貓</small></span>
          </button>
        </div>
      </div>
    </section>
  );
}

export function Hero() {
  const { toast } = useUi();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"city" | "all">("city");
  const [res, setRes] = useState<ReturnType<typeof matchCats> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  function run(text: string, sc = scope) {
    if (!text.trim()) { toast("先說說你的生活，或點下面的範例"); return; }
    setRes(matchCats(CATS, text, sc, DEFAULT_CITY));
    requestAnimationFrame(() => boxRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  return (
    <section className="hero">
      <div className="wrap hero-in">
        <div>
          <span className="announce" id="adopt-search">✨ 領養前，先跟牠的分身同居 7 天 <span className="pill pink">新功能</span></span>
          <h2 className="stroked hero-title">讓每隻貓都找到<span>好的家</span></h2>
          <p className="lede">中途之家、愛貓人士和想領養的人，在這裡記錄貓咪的日常，也讓好的相遇發生。</p>

          <form className="search" role="search" onSubmit={e => { e.preventDefault(); run(q); }}>
            <label htmlFor="q" className="search-label">💖 想領養？用一句話說說你的生活</label>
            <span id="q-hint" className="sr">例如住哪裡、有沒有養過貓、喜歡什麼個性</span>
            <textarea id="q" rows={2} aria-describedby="q-hint" value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(q); } }}
              placeholder="例如：我住台中北屯，第一次養，想要親人的成貓" />
            <div className="search-row">
              <div className="scope" role="radiogroup" aria-label="搜尋範圍">
                {(["city", "all"] as const).map(s => (
                  <button key={s} type="button" role="radio" aria-checked={scope === s} className={scope === s ? "on" : ""}
                    onClick={() => { setScope(s); if (q.trim()) run(q, s); }}>
                    {s === "city" ? "同縣市" : "全台"}
                  </button>
                ))}
              </div>
              <span className="spacer" />
              <button type="button" className="icon-btn" aria-label="用說的" data-proto="語音輸入">🎙️</button>
              <button type="submit" className="btn">🐾 幫我找貓</button>
            </div>
          </form>

          {res && (
            <div className="results" ref={boxRef}>
              <h3>這幾隻可能跟你合得來 💖</h3>
              <div className="parsed">我們聽到的條件：{res.conditions}</div>
              {res.results.map(({ cat }) => (
                <div className="result" key={cat.id}>
                  <img src={photo(cat.photo)} alt={`${cat.name}的照片`} />
                  <div><b>{cat.name}</b>｜{cat.age}｜{cat.city}{cat.dist}<p className="why">{cat.why}</p></div>
                </div>
              ))}
              <button className="btn ghost sm" data-login>登入後用你的生活資料重新配對</button>
            </div>
          )}

          <div className="chips" aria-label="試試這些說法">
            {EXAMPLES.map(t => (
              <button key={t} type="button" className="chip" onClick={() => { setQ(t); run(t); }}>{t}</button>
            ))}
          </div>

          <div className="hero-cta">
            <a className="btn mint" href="#trial">🧶 看看虛擬試養</a>
            <a className="btn ghost" href="#adopt">瀏覽待領養貓咪</a>
          </div>
          <div className="proof">
            <div className="faces">
              {(["orange", "black", "calico", "gray"] as const).map(k => <img key={k} src={photo(k)} alt="" />)}
            </div>
            <span>本月已有 <b>36</b> 隻貓透過 Meowho喵戶 找到家</span>
          </div>
        </div>

        <div className="room" aria-label="虛擬試養預覽">
          <div className="room-bar">🏠 小晴的陽光貓屋 <span className="pill mint">舒適度 98%</span></div>
          <div className="room-pic">
            <img src={photo("room")} alt="陽光灑進的溫馨貓咪客廳" />
            <div className="bubble">喵～想試試當一日新手貓奴嗎？<small>橘子正在等你一起玩逗貓棒</small></div>
          </div>
        </div>
      </div>
    </section>
  );
}
