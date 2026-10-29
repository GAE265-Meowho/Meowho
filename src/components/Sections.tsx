"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { CATS, DEFAULT_CITY, KB, POSTS, STATS, type Cat } from "@/lib/mock-data";
import { adoptList } from "@/lib/match";
import { photo } from "@/lib/photos";

/* ---------- 統計 ---------- */
function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    const t0 = performance.now(); let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <strong>{v.toLocaleString()}</strong>;
}

export function Stats() {
  return (
    <section className="stats wrap" aria-label="平台現況">
      <div className="stat"><CountUp to={STATS.waiting} /><span>🏠 隻貓正在等家</span></div>
      <div className="stat"><CountUp to={STATS.matched} /><span>💖 隻已經回家</span></div>
      <div className="stat"><CountUp to={STATS.users} /><span>🐾 位貓友加入</span></div>
    </section>
  );
}

/* ---------- 一條時間軸（樣板：黃底三欄，圓潤橢圓照片） ---------- */
export function Timeline() {
  const items = [
    { n: "01", tag: "🏠 記錄｜時光小屋", title: "每隻貓，都有自己的時光小屋", body: "貓戶長拍照、說幾句話就能建檔；日記、相簿和 60 秒影片，AI 每週整理成輕鬆的週報，累積成牠完整的生活誌。", img: "orange" as const },
    { n: "02", tag: "💬 媒合｜帶我回家", title: "一句話，找到合得來的貓", body: "說說你的生活就好。AI 比對中途寫下的真實日記，不只看標籤，還會告訴你為什麼推薦這隻貓。", img: "calicoEat" as const },
    { n: "03", tag: "🏡 終養｜負責任的相遇", title: "先準備好，再一起回家", body: "AR 環境報告或 7 天虛擬飼養，依年紀估算的首年花費；移轉後，紀錄跟著牠搬進新家，中途也能看見牠過得好。", img: "ragdoll" as const },
  ];
  return (
    <section className="timeline" aria-labelledby="timelineTitle">
      <div className="wrap">
        <p className="tl-eyebrow"><span className="pill butter">記錄 × 媒合 × 終養</span></p>
        <h2 id="timelineTitle" className="tl-title">一條時間軸，串起貓的一生</h2>
        <ol className="tl-list">
          {items.map(i => (
            <li key={i.n}>
              <div className="tl-photo"><img src={photo(i.img)} alt="" loading="lazy" /></div>
              <div className="tl-head"><b>{i.n}</b><span className="pill oat">{i.tag}</span></div>
              <h3>{i.title}</h3>
              <p>{i.body}</p>
            </li>
          ))}
        </ol>
        <p className="tl-foot">相遇｜Responsible Pet Ownership・用 AI 支持終養不棄養</p>
      </div>
    </section>
  );
}

/* ---------- 帶我回家：拍立得卡片 ---------- */
const FILTERS: { id: string; label: string; test: (c: Cat) => boolean }[] = [
  { id: "all", label: "全部", test: () => true },
  { id: "novice", label: "新手友善 ⭐", test: c => c.novice },
  { id: "active", label: "活潑好動 ⚡", test: c => c.tags.some(t => /活潑|好奇/.test(t)) },
  { id: "calm", label: "安靜陪伴 🌙", test: c => c.tags.some(t => /安靜|溫和|獨立/.test(t)) },
  { id: "special", label: "需要特別照護 💊", test: c => c.special },
];
const TAPES = ["pink", "mint", "butter"] as const;
const stars = (n: number) => "🐾".repeat(n);

export function Adopt() {
  const [f, setF] = useState("all");
  const all = adoptList(CATS, DEFAULT_CITY, 99);
  const list = all.filter(FILTERS.find(x => x.id === f)!.test).slice(0, 4);
  return (
    <section className="section" id="adopt" aria-labelledby="adoptTitle">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <h2 id="adoptTitle" className="h2">帶我回家 🐾</h2>
            <p className="sub">{DEFAULT_CITY}｜等最久的貓排在前面，每一隻都有中途寫下的真實日常</p>
          </div>
          <a className="more" href="#" data-proto="待認養列表頁">看全部 {all.length} 隻</a>
        </div>
        <div className="filters" role="tablist" aria-label="篩選">
          {FILTERS.map(x => (
            <button key={x.id} role="tab" aria-selected={f === x.id} className={f === x.id ? "on" : ""} onClick={() => setF(x.id)}>{x.label}</button>
          ))}
        </div>
        <div className="polaroids">
          {list.length === 0 && <p className="sub">這個分類目前沒有貓咪，換個條件看看吧。</p>}
          {list.map((c, i) => (
            <article className="polaroid" key={c.id}>
              <span className={`tape ${TAPES[i % 3]}`} aria-hidden="true" />
              <div className="photo">
                <img src={photo(c.photo)} alt={`${c.name}的照片`} loading="lazy" />
                <span className="pill butter">等家 {c.waitDays} 天</span>
                <span className="wait pill mint">{c.neutered ? "已結紮 ⭐" : "待結紮"}</span>
              </div>
              <div className="body">
                <h3>{c.name} <small>{c.sex}｜{c.age}</small></h3>
                <div className="meta">📍 {c.city}{c.dist}</div>
                <div className="tags">{c.tags.map((t, j) => <span key={t} className={`pill ${["peach", "pink", "mint"][j % 3]}`}>{t}</span>)}</div>
                <p className="note">📝 {c.week}</p>
                <div className="meter">
                  <div><span>親人度</span><span className="paws">{stars(c.tags.some(t => /親人|黏|撒嬌/.test(t)) ? 5 : 3)}</span></div>
                  <div><span>活力值</span><span className="paws">{stars(c.tags.some(t => /活潑|好奇/.test(t)) ? 5 : c.ageBand === "老貓" ? 2 : 3)}</span></div>
                </div>
                <div className="actions">
                  <button className="btn mint sm" data-login>虛擬試養</button>
                  <button className="btn sm" data-proto={`${c.name}的貓咪頁`}>認識牠</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- 三步通關 ---------- */
export function Steps() {
  const steps = [
    { ico: "🏠", bg: "#FFE1D4", tag: "第 1 關", title: "打造喵星人安全窩", body: "拍一段家裡的影片，AI 幫你找出窗戶、電線、植物等風險，產出飼養環境建議報告。", goal: "🎯 完成居家環境報告" },
    { ico: "🧶", bg: "#D4F5EC", tag: "第 2 關", title: "7 天虛擬試養", body: "跟想領養那隻貓的分身同居 7 天：半夜跑酷、吐毛球、挑食，都是牠的真實習慣。", goal: "🎯 拿到試養完成徽章" },
    { ico: "📜", bg: "#FFF3C4", tag: "第 3 關", title: "提出領養申請", body: "看清楚第一年的照顧重點與花費，帶著報告與徽章送出申請，跟中途私訊約面談。", goal: "🎯 送出領養申請" },
  ];
  return (
    <section className="section wrap" aria-labelledby="stepsTitle">
      <div className="sec-head">
        <div>
          <h2 id="stepsTitle" className="h2">三步通關，準備好再帶牠回家 🏆</h2>
          <p className="sub">沒有養貓經驗嗎？完成第 1 或第 2 關就能申請；有經驗的貓友可以直接申請。</p>
        </div>
      </div>
      <ol className="steps" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {steps.map(s => (
          <li className="step" key={s.tag}>
            <span className="ico" style={{ background: s.bg }} aria-hidden="true">{s.ico}</span>
            <h3><span className="pill oat">{s.tag}</span>{s.title}</h3>
            <p>{s.body}</p>
            <span className="goal">{s.goal}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- 虛擬試養看板 ---------- */
export function TrialBoard() {
  const [done, setDone] = useState<Record<number, boolean>>({ 0: true, 1: true });
  const tasks = [
    { ico: "🍽️", title: "早上 8:00 準時餵食", desc: "橘子只吃濕食，記得退冰 10 分鐘" },
    { ico: "🧹", title: "清理貓砂盆", desc: "牠很愛乾淨，砂盆髒了會在旁邊抗議" },
    { ico: "🌙", title: "凌晨 3:00 跑酷事件", desc: "橘子開始在走廊衝刺、抓門，你會怎麼做？" },
    { ico: "🤮", title: "突發狀況：吐毛球", desc: "週三吐了一次毛球，要怎麼判斷需不需要看醫生？" },
  ];
  const n = Object.values(done).filter(Boolean).length;
  return (
    <section className="section wrap" id="trial" aria-labelledby="trialTitle">
      <div className="board">
        <div className="board-head">
          <div className="who">
            <img src={photo("orange")} alt="橘子" />
            <div>
              <h2 id="trialTitle" className="h2" style={{ fontSize: "1.35rem" }}>橘子的分身・虛擬試養第 3 天</h2>
              <p className="sub">任務來自中途寫下的真實日記與每週週報</p>
            </div>
          </div>
          <div className="candy" role="progressbar" aria-valuenow={n} aria-valuemin={0} aria-valuemax={tasks.length} aria-label="今日任務進度">
            <i style={{ width: `${(n / tasks.length) * 100}%` }} /><b>今日 {n}/{tasks.length} ⭐</b>
          </div>
        </div>
        <div className="tasks">
          {tasks.map((t, i) => (
            <div className={`task${done[i] ? " done" : ""}`} key={t.title}>
              <span className="tico" aria-hidden="true">{done[i] ? "✅" : t.ico}</span>
              <div><h4>{t.title}</h4><p>{t.desc}</p></div>
              <span className="act">
                {done[i] ? <span className="pill mint">已完成</span>
                  : <button className="btn pink sm" onClick={() => setDone(d => ({ ...d, [i]: true }))}>去回應</button>}
              </span>
            </div>
          ))}
        </div>
        <div className="board-foot">
          <span>💡 這是示意：登入後選一隻想領養的貓，就能開始你的 7 天試養。</span>
          <button className="btn butter sm" data-login>🎁 開始我的試養</button>
        </div>
      </div>
    </section>
  );
}

/* ---------- 動態牆 ---------- */
export function Feed() {
  const [liked, setLiked] = useState<Record<number, boolean>>({});
  return (
    <section className="section" id="feed" aria-labelledby="feedTitle">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <h2 id="feedTitle" className="h2">貓咪生活即時動態牆 📷</h2>
            <p className="sub">來自貓戶與中途之家的暖心瞬間</p>
          </div>
          <a className="more" href="#" data-proto="動態牆頁">看更多</a>
        </div>
        <div className="feed">
          {POSTS.map((p, i) => (
            <article className="polaroid" key={p.home}>
              <span className={`tape ${p.tape}`} aria-hidden="true" />
              <div className="photo"><img src={photo(p.photo)} alt={`${p.home}的貓咪照片`} loading="lazy" /></div>
              <p className="post-text">「{p.text}」</p>
              <p className="post-meta">🏠 {p.home}｜{p.city}｜{p.time}</p>
              <div className="post-foot">
                <button aria-pressed={!!liked[i]} onClick={() => setLiked(l => ({ ...l, [i]: !l[i] }))}>{liked[i] ? "💖" : "🤍"} {p.likes + (liked[i] ? 1 : 0)}</button>
                <button data-login>💬 {p.comments}</button>
                <button data-proto="分享連結">↗ 分享</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- 喵喵諮詢站（知識區入口；正式版改接知識庫 RAG） ---------- */
const ANSWERS: Record<string, string> = {
  "第一年要花多少錢？": "以 4 公斤成貓估算：飼料約 7,400 元、貓砂約 3,600 元、疫苗健檢約 2,500 元，再加上一次性用品約 4,000 元，第一年大約 1.8～2 萬元。實際金額會依貓咪年紀與健康狀況調整（示意數字）。",
  "接貓回家前要準備什麼？": "先做三件事：窗戶與陽台裝上防護網、把電線收好、移開不確定是否有毒的植物。也可以拍一段家裡的影片，讓 AI 幫你產出環境報告。",
  "幼貓多久打疫苗？": "幼貓通常在 8 週左右開始第一劑，之後依獸醫建議追加；結紮時間請與獸醫討論。詳細時程請看知識區「第一年的疫苗與結紮時程」。",
  "貓咪不愛喝水怎麼辦？": "可以試試流動飲水器、多放幾個水碗，或在飲食中加入濕食。如果喝水量明顯改變，建議就醫檢查（僅供參考，非醫療建議）。",
};

export function Consult() {
  const [q, setQ] = useState("");
  const [a, setA] = useState<string | null>(null);
  const ask = (text: string) => {
    if (!text.trim()) return;
    setA(ANSWERS[text] ?? "這題喵喵還在學習中～正式版會從養貓知識庫幫你找答案。先看看下面的知識文章吧！");
  };
  return (
    <section className="section wrap" id="consult" aria-labelledby="consultTitle">
      <div className="consult">
        <div>
          <div className="npc">
            <div className="face"><img src={photo("munchkin")} alt="" /></div>
            <div>
              <h3 id="consultTitle">喵喵諮詢站 <span className="pill peach">養貓知識</span></h3>
              <p className="sub">領養前的疑問，問喵喵就對了</p>
            </div>
          </div>
          <div className="bubble" style={{ marginTop: "1rem" }}>喵～有任何養貓、領養流程的問題，都可以問我喔！ฅ^•ﻌ•^ฅ</div>
          <ul style={{ listStyle: "none", padding: 0, margin: "1.6rem 0 0", display: "grid", gap: ".5rem" }}>
            {KB.map(k => (
              <li key={k.title}><a href="#" data-proto="知識文章" className="pill oat" style={{ fontSize: ".85rem" }}>📖 {k.band}｜{k.title}</a></li>
            ))}
          </ul>
        </div>
        <div style={{ display: "grid", gap: ".9rem", alignContent: "start" }}>
          <p className="sub" style={{ margin: 0 }}>點選常見問題，或直接輸入：</p>
          <div className="quick">
            {Object.keys(ANSWERS).map(k => <button key={k} className="chip" onClick={() => { setQ(k); ask(k); }}>{k}</button>)}
          </div>
          <form className="ask" onSubmit={e => { e.preventDefault(); ask(q); }}>
            <label htmlFor="askq" className="sr">輸入你的問題</label>
            <input id="askq" value={q} onChange={e => setQ(e.target.value)} placeholder="例如：貓咪不愛喝水怎麼辦？" />
            <button className="btn sm" type="submit">送出 🐾</button>
          </form>
          {a && <div className="answer" role="status">🐱 {a}</div>}
        </div>
      </div>
    </section>
  );
}
