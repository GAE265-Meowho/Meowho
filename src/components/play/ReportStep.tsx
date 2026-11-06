"use client";
// 虛擬飼養 DEMO（#237）：試養報告。發生的事、每個選擇、花費（一次性／每月／醫療／意外，全部由 costs.ts 公式算）、
// 建議（/api/play/advice：AI 寫，失敗時規則產生；AI 不產生數字），最後「前往認養這隻貓」（DEMO 先連回貓咪頁）。
import { useEffect, useState } from "react";
import CatButton from "@/components/ui/CatButton";
import type { PlayerHome } from "@/lib/play/background";
import { formatNT, reportCosts, shopCosts, type ChoiceCost, type ShopPick } from "@/lib/play/costs";
import type { PlayState } from "@/lib/play/flow";
import { ruleAdvice } from "@/lib/play/report";
import { fillPlaces, type Places } from "@/lib/play/room";
import { DISCLAIMER, STORY } from "@/lib/play/story";
import s from "./play.module.css";

export function ReportStep({ state, pick, home, places, catName, catHref, onRestart }: {
  state: PlayState; pick: ShopPick; home: PlayerHome; places: Places; catName: string; catHref: string; onRestart: () => void;
}) {
  const fill = (t: string) => fillPlaces(t, places, catName);
  const shop = shopCosts(pick, "kitten");
  const costs = reportCosts(shop, state.choices.map(c => c.option.cost).filter((c): c is ChoiceCost => Boolean(c)));
  const [tips, setTips] = useState<string[] | null>(null);

  useEffect(() => {
    const body = {
      catName, home,
      hazards: state.hazards, handled: state.handled, overBudget: shop.overBudget,
      choices: state.choices.map(c => ({
        prompt: fill(c.prompt).slice(0, 40), text: fill(c.option.text).slice(0, 80), good: c.option.good, feedback: fill(c.option.feedback).slice(0, 200),
      })),
    };
    const fallback = () => ruleAdvice(body);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    fetch("/api/play/advice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { tips?: string[] }) => setTips(j.tips?.length ? j.tips : fallback()))
      .catch(() => setTips(fallback()))
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); ctrl.abort(); };
    // 報告只在進入時產生一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const event = state.event;
  return (
    <>
      <section className={s.card} aria-labelledby="report-title">
        <span className={s.kicker}>試養報告</span>
        <h2 id="report-title">{catName}的一生，謝謝你陪牠走完</h2>
        <ul className={s.log}>
          {STORY.map(n => (
            <li key={n.id}>
              <strong>{n.title}</strong>
              <span>{state.choices.filter(c => c.nodeId === n.id && c.option.good).length}／{state.choices.filter(c => c.nodeId === n.id).length} 個選擇是建議做法</span>
              {n.id === "five-years" && event && (
                <span>{event.kind === "accident" ? `居家意外：${event.hazard.label}` : event.key === "hairball" ? "小狀況：吐毛球" : "小狀況：經濟吃緊"}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={s.card} aria-labelledby="choice-title">
        <h2 id="choice-title">每個選擇</h2>
        <ul className={s.log}>
          {state.choices.map(c => (
            <li key={`${c.nodeId}-${c.beatId}`}>
              <span className={`${s.tag} ${c.option.good ? s.ok : ""}`}>{c.option.good ? "建議做法" : "可以更好"}</span>
              <strong>{fill(c.prompt)}</strong>
              {fill(c.option.text)}
            </li>
          ))}
        </ul>
      </section>

      <section className={s.card} aria-labelledby="cost-title">
        <h2 id="cost-title">花費</h2>
        <dl className={s.sum}>
          <dt>一次性（用品）</dt><dd>{formatNT(costs.oneTime)}</dd>
          <dt>每月（飼料＋貓砂）</dt><dd>{formatNT(costs.monthly)}</dd>
          <dt>醫療（健康檢查、安寧照護）</dt><dd>{formatNT(costs.medical)}</dd>
          <dt>意外</dt><dd>{formatNT(costs.accident)}</dd>
          <dt>一次性＋醫療＋意外</dt><dd>{formatNT(costs.total)}</dd>
        </dl>
        {shop.overBudget && <p className={s.over}>每月花費超過你的預算 {formatNT(costs.monthly - pick.budget)}</p>}
      </section>

      <section className={s.card} aria-labelledby="tips-title" aria-live="polite">
        <h2 id="tips-title">給你的建議</h2>
        {tips ? <ul className={s.log}>{tips.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className={s.lead}>正在整理建議…</p>}
        <p className={s.disclaimer}>{DISCLAIMER}</p>
        <div className={s.actions}>
          <CatButton href={catHref} arrow>前往認養這隻貓</CatButton>
          <CatButton variant="ghost" size="sm" onClick={onRestart}>再玩一次</CatButton>
        </div>
      </section>
    </>
  );
}
