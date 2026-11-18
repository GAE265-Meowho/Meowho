"use client";
// 試養報告「依你家的情況」（#354，渝茜 2026-11-18）：上面是從喵戶資料看的 6 格，下面是「問問自己」5 格（已準備好請打勾）。
// 點格子，建議出現在那一塊的下面（渝茜：統一放在區塊下面，不要一排一排插進去）。規則與文字在 lib/play/home-readiness.ts。
import { useState, type ReactNode } from "react";
import { homeTiles, readinessCounts, selfChecks, STATUS_LABEL, type HomeTile, type ReadinessInput, type SelfCheck } from "@/lib/play/home-readiness";
import h from "./home-readiness.module.css";
import s from "./play.module.css";

const MARK = { ok: "✓", warn: "!", bad: "✕" } as const;

function TileIcon({ k }: { k: HomeTile["key"] }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (k === "housing") return <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 19 20 7l14 12" {...stroke} /><path d="M10 17v15h20V17" {...stroke} /><circle cx="20" cy="24" r="3" fill="currentColor" /></svg>;
  if (k === "allergy") return <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14" {...stroke} /><path d="M14 17q2-2 4 0M22 17q2-2 4 0M16 26q4-3 8 0" {...stroke} /><circle cx="32" cy="9" r="2" fill="currentColor" /></svg>;
  if (k === "pets") return <svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="25" rx="8" ry="7" {...stroke} /><circle cx="11" cy="15" r="3.4" fill="currentColor" /><circle cx="17" cy="10" r="3.4" fill="currentColor" /><circle cx="24" cy="10" r="3.4" fill="currentColor" /><circle cx="30" cy="15" r="3.4" fill="currentColor" /></svg>;
  if (k === "exp") return <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 10h10a4 4 0 0 1 4 4v18a3 3 0 0 0-3-3H8zM32 10H22v22a3 3 0 0 1 3-3h7z" {...stroke} /></svg>;
  if (k === "budget") return <svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="12" width="28" height="18" rx="4" {...stroke} /><circle cx="20" cy="21" r="4" {...stroke} /></svg>;
  return <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="14" cy="15" r="5" {...stroke} /><circle cx="27" cy="17" r="4" {...stroke} /><path d="M5 33c1-6 5-9 9-9s8 3 9 9M21 33c1-4 3-6 6-6s5 2 6 6" {...stroke} /></svg>;
}

function Detail({ children, id }: { children: ReactNode; id: string }) {
  return <div className={h.detail} id={id} aria-live="polite">{children}</div>;
}

export function HomeReadiness({ input, fundShort, sample }: { input: ReadinessInput; fundShort: boolean; sample: boolean }) {
  const tiles = homeTiles(input);
  const checks = selfChecks(fundShort);
  const [done, setDone] = useState<boolean[]>(() => checks.map(() => false));
  const [openTile, setOpenTile] = useState<HomeTile["key"] | null>(null);
  const [openCheck, setOpenCheck] = useState<SelfCheck["key"] | null>(null);
  const c = readinessCounts(tiles, done);
  const tile = tiles.find(t => t.key === openTile);
  const check = checks.find(x => x.key === openCheck);

  return (
    <section className={s.card} aria-labelledby="readiness-title">
      <h2 id="readiness-title">依你家的情況</h2>
      {sample && <p className={s.lead}>你還沒有喵戶，這裡先用一個範例的家。</p>}
      <div className={h.counts}>
        <span data-st="ok">✓ {c.ok} 項沒問題</span>
        {c.warn > 0 && <span data-st="warn">! {c.warn} 項要準備</span>}
        {c.bad > 0 && <span data-st="bad">✕ {c.bad} 項要先處理</span>}
        {c.ask > 0 && <span data-st="ask">{c.ask} 項還沒打勾</span>}
      </div>
      <div className={h.seg} aria-hidden="true">{c.bar.map((st, i) => <i key={i} data-st={st} />)}</div>

      <div className={h.block}>
        <h3 className={h.blockTitle}>從你填的資料看</h3>
        <div className={h.tiles}>
          {tiles.map(t => (
            <button key={t.key} type="button" className={h.tile} aria-expanded={openTile === t.key} aria-controls="readiness-data-detail"
              onClick={() => setOpenTile(k => (k === t.key ? null : t.key))}>
              <span className={h.top}>
                {t.people ? <span className={h.people}>{t.people.slice(0, 3).map(p => <span key={p}>{p}</span>)}</span> : <span className={h.icon}><TileIcon k={t.key} /></span>}
                <span className={h.st} data-st={t.status}>{MARK[t.status]} {STATUS_LABEL[t.status]}</span>
              </span>
              <span className={h.k}>{t.label}</span>
              <span className={h.v}>{t.value}</span>
              {t.ratio !== undefined && <span className={h.bar} data-st={t.status} aria-hidden="true"><i style={{ width: `${Math.round(t.ratio * 100)}%` }} /></span>}
            </button>
          ))}
        </div>
        <Detail id="readiness-data-detail">
          {tile ? (
            <>
              <p className={h.dTitle}>{tile.title}</p>
              {tile.body.map(b => <p key={b}>{b}</p>)}
              {tile.todo && <ul className={h.todo}>{tile.todo.map(x => <li key={x.head}><b>{x.head}</b>：{x.text}</li>)}</ul>}
              {tile.act && <p className={h.act}>建議：{tile.act}</p>}
            </>
          ) : <p className={h.dTitle}>點一格看建議</p>}
        </Detail>
      </div>

      <div className={h.block}>
        <h3 className={h.blockTitle}>問問自己<span>已準備好請打勾</span></h3>
        <div className={`${h.tiles} ${h.self}`}>
          {checks.map((x, i) => (
            <div key={x.key} className={h.tile} data-done={done[i]} data-open={openCheck === x.key}>
              <span className={h.top}>
                <button type="button" className={h.openBtn} aria-expanded={openCheck === x.key} aria-controls="readiness-self-detail"
                  onClick={() => setOpenCheck(k => (k === x.key ? null : x.key))}>{x.label}</button>
                <label className={h.box}>
                  <input type="checkbox" checked={done[i]} onChange={e => setDone(v => v.map((d, j) => (j === i ? e.target.checked : d)))} />
                  <span className={h.vh}>{x.label}：已準備好</span>
                </label>
              </span>
              <button type="button" className={h.vBtn} aria-expanded={openCheck === x.key} aria-controls="readiness-self-detail" tabIndex={-1}
                onClick={() => setOpenCheck(k => (k === x.key ? null : x.key))}>{x.value}</button>
            </div>
          ))}
        </div>
        <Detail id="readiness-self-detail">
          {check ? <><p className={h.dTitle}>{check.title}</p><p>{check.body}</p></> : <p className={h.dTitle}>點一格看說明</p>}
        </Detail>
      </div>
    </section>
  );
}
