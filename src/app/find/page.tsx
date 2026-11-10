"use client";
/* eslint-disable @next/next/no-img-element */
// 幫我找貓的結果頁（規格 docs/spec/11）：網址 ?q=<一句話>&scope=city|all，重新整理或分享都看得到同一次搜尋。
// 搜尋交給 /api/find；條件標籤分「從你的話」「從你的喵戶」兩組；推薦卡片沿用首頁「帶我回家」的貓卡，多一句為什麼推薦。
// 沒打字時：有自己家喵戶的會員看「依你的喵戶推薦」，其他人看引導描述需求的畫面。
import { useCallback, useEffect, useState } from "react";
import { SiteHeader, TabBar } from "@/components/Chrome";
import styles from "@/components/home/adopt/adopt.module.css";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import type { FeedCat } from "@/lib/adopt-feed";
import type { Scope } from "@/lib/find-cats";
import { getBrowserSupabase } from "@/lib/supabase/client";
import s from "./find.module.css";

type Result = FeedCat & { reason: string };
interface Found {
  scope: Scope; city: string | null; conditionCity: string | null; labels: { query: string[]; home: string[] };
  usedHome: boolean; fromHomeOnly: boolean; need: string; results: Result[];
}
type State = { status: "idle" } | { status: "loading" } | { status: "need" } | { status: "error"; message: string } | { status: "done"; data: Found };

const EXAMPLES = ["上班族，白天不在家，想要獨立一點的貓", "家裡有小孩，想找溫和的貓", "第一次養貓，住台北的公寓"];

export default function FindPage() {
  const sb = getBrowserSupabase();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("city");
  const [state, setState] = useState<State>({ status: "idle" });

  const search = useCallback(async (query: string, sc: Scope) => {
    if (!sb) return;
    setState({ status: "loading" });
    const res = await fetch("/api/find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: query, scope: sc }) })
      .then(async r => ({ ok: r.ok, body: await r.json().catch(() => null) })).catch(() => null);
    if (!res?.body) { setState({ status: "error", message: "搜尋失敗，請再試一次。" }); return; }
    if (!res.ok) { setState({ status: "error", message: res.body.error ?? "搜尋失敗，請再試一次。" }); return; }
    if (res.body.needQuery) { setState({ status: "need" }); return; }
    const found = res.body as Found;
    setState({ status: "done", data: found });
    // 先顯示規則組的推薦理由，再換成 AI 寫的（前 6 名）
    const ids = found.results.slice(0, 6).map(r => r.id);
    if (!ids.length) return;
    const ai = await fetch("/api/find/reasons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ need: found.need, ids }) })
      .then(r => r.json()).catch(() => null) as { reasons?: { id: string; reason: string }[] } | null;
    if (!ai?.reasons?.length) return;
    setState(cur => cur.status === "done" && cur.data === found
      ? { status: "done", data: { ...found, results: found.results.map(r => ({ ...r, reason: ai.reasons!.find(x => x.id === r.id)?.reason ?? r.reason })) } }
      : cur);
  }, [sb]);

  // 讀網址：?q= 和 ?scope=；上一頁、下一頁時重新讀
  useEffect(() => {
    const read = () => {
      const u = new URL(window.location.href);
      const query = u.searchParams.get("q") ?? "";
      const sc: Scope = u.searchParams.get("scope") === "all" ? "all" : "city";
      setQ(query); setScope(sc);
      search(query, sc);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [search]);

  function go(query: string, sc: Scope) {
    const u = new URL(window.location.href);
    if (query.trim()) u.searchParams.set("q", query.trim()); else u.searchParams.delete("q");
    u.searchParams.set("scope", sc);
    window.history.pushState(null, "", u);
    setQ(query); setScope(sc);
    search(query.trim(), sc);
  }

  const data = state.status === "done" ? state.data : null;
  let body: React.ReactNode;
  if (!sb) body = <p className={f.warn}>示範模式：還沒連接資料庫，沒有貓可以搜尋。</p>;
  else if (state.status === "loading" || state.status === "idle") body = <p className={f.lead} role="status">正在幫你找合得來的貓…</p>;
  else if (state.status === "error") body = <p className={f.error} role="alert">{state.message}</p>;
  else if (state.status === "need") body = (
    <section className={`${f.card} ${f.center}`} aria-labelledby="need-title">
      <span className={f.avatar} aria-hidden="true"><Icon name="search" /></span>
      <h2 id="need-title">說說你的生活，幫你找合得來的貓</h2>
      <p className={f.lead}>住在哪裡、家裡有誰、白天在不在家、喜歡什麼個性，都可以寫。</p>
      <div className={s.examples}>
        {EXAMPLES.map(e => <button key={e} type="button" className={s.example} onClick={() => go(e, scope)}>{e}</button>)}
      </div>
    </section>
  );
  else if (data && !data.results.length) body = (
    <section className={`${f.card} ${f.center}`} aria-labelledby="none-title">
      <h2 id="none-title">{data.scope === "city" && data.city ? `${data.city}目前沒有合適的貓` : "目前沒有合適的貓"}</h2>
      <p className={f.lead}>可以換個說法，或看看其他地方的貓。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}>
        {data.scope === "city" && <CatButton onClick={() => go(q, "all")}>改成全台</CatButton>}
        <CatButton variant="ghost" href="/#adopt">看所有待領養的貓</CatButton>
      </div>
    </section>
  );
  else if (data) body = (
    <ul className={`${styles.grid} ${s.grid}`}>
      {data.results.map(c => (
        <li key={c.id} className={styles.card}>
          <div className={styles.photo}>
            {c.photo ? <img src={c.photo} alt={`${c.name}的照片`} loading="lazy" /> : <Icon name="cat" size={64} />}
            <span className={styles.wait}>等家 {c.waitDays} 天</span>
          </div>
          <div className={styles.body}>
            <div className={styles.nameRow}>
              <h3>{c.name}</h3>
              <span>{[c.sex, c.stage].filter(Boolean).join("｜")}</span>
            </div>
            {c.district && <p className={styles.district}><Icon name="pin" size={14} />{c.district}</p>}
            {c.tags.length > 0 && <ul className={styles.tags}>{c.tags.slice(0, 3).map(t => <li key={t}>{t}</li>)}</ul>}
            <p className={s.reason}><b>為什麼推薦</b>{c.reason}</p>
            {c.diary && <p className={styles.diary}><span><Icon name="diary" size={14} />中途日記</span>{c.diary}</p>}
            <div className={styles.actions}>
              <CatButton href={`/cats/${c.id}`} size="sm">認識{c.name}</CatButton>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={f.title}>幫我找貓</h1>
        <form className={s.search} onSubmit={e => { e.preventDefault(); go(q, scope); }}>
          <label htmlFor="find-input" className={s.srOnly}>說說你的生活，幫你找合得來的貓</label>
          <input id="find-input" value={q} maxLength={200} autoComplete="off" placeholder="說說你住哪、有沒有養過貓、喜歡什麼個性" onChange={e => setQ(e.target.value)} />
          <CatButton type="submit" disabled={state.status === "loading"}>幫我找貓</CatButton>
        </form>

        {data && (
          <div className={s.bar}>
            {data.fromHomeOnly && <p className={s.title}>依你的喵戶推薦</p>}
            <div className={s.chips} aria-label="這次用的條件">
              {data.labels.query.map(t => <span key={`q-${t}`} className={s.chip}>{t}</span>)}
              {data.labels.home.length > 0 && (
                <>
                  <span className={s.from}>從你的喵戶</span>
                  {data.labels.home.map(t => <span key={`h-${t}`} className={`${s.chip} ${s.home}`}>{t}</span>)}
                </>
              )}
            </div>
            <div className={s.scope} role="radiogroup" aria-label="範圍">
              {/* 沒有縣市（那句話沒說、也沒有喵戶）時只能全台 */}
              <button type="button" role="radio" aria-checked={data.scope === "city"} disabled={!data.conditionCity} onClick={() => go(q, "city")}>
                {data.conditionCity ? `同縣市（${data.conditionCity}）` : "同縣市"}
              </button>
              <button type="button" role="radio" aria-checked={data.scope === "all"} onClick={() => go(q, "all")}>全台</button>
            </div>
          </div>
        )}

        {body}
      </main>
      <TabBar />
    </>
  );
}
