"use client";
// 虛擬飼養 DEMO（#237）：試養報告，照 catgame 原版（24k 的 fullMemoryHTML、fullReportHTML、fullAdvice）：
//   回憶 → 標題（你和麻糬的 N 年／你和麻糬分開了）→ 花費與麻糬對你 → 這一生發生的事 → 作息與花費（一次性／每月／醫療／意外／其他）
//   → 做得好的地方／可以再想想的地方 → 給你的建議（原版規則）→ AI 依你的家補充的建議（DEMO，/api/play/advice，失敗時規則產生）
//   → 收養之前，問問自己 → 前往認養這隻貓（DEMO 先連回貓咪頁）。
// 金額全部由公式算（costs.ts、flow.ts），AI 不產生數字。原版的「配對參考」「看看這隻貓是誰」DEMO 不做（固定麻糬）。
import { Fragment, useEffect, useState } from "react";
import { CARE_ACTS } from "@/lib/play/care";
import CatButton from "@/components/ui/CatButton";
import type { PlayerHome } from "@/lib/play/background";
import { costTotal, money, type ShopPick } from "@/lib/play/costs";
import type { PlayState } from "@/lib/play/flow";
import {
  checksVerdict, DISCLAIMER, EXP_CHECKS, fullAdvice, HEALTH_NOTE, memoryMoments, OUTRO, ruleAdvice, trustWord,
} from "@/lib/play/report";
import { STORY } from "@/lib/play/story";
import s from "./play.module.css";

export function ReportStep({ state, pick, monthly, home, catHref, onRestart }: {
  state: PlayState; pick: ShopPick; monthly: number; home: PlayerHome; catHref: string; onRestart: () => void;
}) {
  const X = state.life, C = X.cost, total = costTotal(C);
  const years = Math.max(1 / 12, (X.age - 2) / 12);
  const good = X.picks.filter(p => p.good === true), bad = X.picks.filter(p => p.good === false);
  const [checks, setChecks] = useState<boolean[]>(() => EXP_CHECKS.map(() => false));
  const [tips, setTips] = useState<string[] | null>(null);
  const nChecked = checks.filter(Boolean).length;
  const overBudget = pick.budget > 0 && monthly > pick.budget;

  useEffect(() => {
    const body = {
      catName: X.name, home, hazards: state.hazards, handled: state.handled, overBudget,
      choices: X.picks.slice(0, 20).map(p => ({ prompt: "", text: p.t.slice(0, 80), good: p.good, feedback: "" })),
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

  const row = (l: string, v: number) => <><dt>{l}</dt><dd>{money(v)} 元</dd></>;
  return (
    <>
      <section className={s.card} aria-labelledby="memory-title">
        <h2 id="memory-title">{X.abandoned ? `你和${X.name}的日子` : `${X.name}的一生`}</h2>
        <ol className={s.log}>{memoryMoments(X).map((t, i) => <li key={i}>{t}</li>)}</ol>
      </section>

      <section className={s.card} aria-labelledby="report-title">
        <span className={s.kicker}>試養報告</span>
        <h2 id="report-title">{X.abandoned ? `你和${X.name}分開了` : `你和${X.name}的 ${Math.round(years)} 年`}</h2>
        <p className={s.lead}>{X.abandoned ? "在這次體驗裡，生活的變化讓你選擇了送走牠。現實中，這正是很多貓被棄養的時刻。" : OUTRO}</p>
        <dl className={s.sum}>
          <dt>這段期間大約花費</dt><dd>{money(total)} 元</dd>
          <dt>{X.name}對你</dt><dd>{X.abandoned ? "—" : trustWord(X.trust)}</dd>
        </dl>
      </section>

      <section className={s.card} aria-labelledby="events-title">
        <h2 id="events-title">這一生發生的事</h2>
        <ul className={s.log}>
          {X.events.length
            ? X.events.map(e => <li key={e.id}>{STORY.find(n => n.id === e.node)?.label}：{e.t}</li>)
            : <li>沒有發生意外，照顧得很好。</li>}
        </ul>
      </section>

      <section className={s.card} aria-labelledby="care-title">
        <h2 id="care-title">照顧紀錄</h2>
        <dl className={s.sum}>
          {CARE_ACTS.map(a => <Fragment key={a.act}><dt>{a.label}</dt><dd>{X.care.log[a.act] ?? 0}／{X.care.rounds}</dd></Fragment>)}
        </dl>
      </section>

      <section className={s.card} aria-labelledby="cost-title">
        <h2 id="cost-title">作息與花費</h2>
        <dl className={s.sum}>
          {row("一次性花費（用品、第一次採買）", C.once)}
          {row("每月花費累計（飼料、貓砂、零食、預備金）", C.month)}
          {row("醫療費（健檢、就醫、安寧）", C.med)}
          {row("意外花費", C.acc)}
          {row("其他", C.other)}
          {row("總花費", total)}
          <dt>平均每年／每月</dt><dd>{money(total / years)} ／ {money(total / years / 12)} 元</dd>
          <dt>你填的每月預算</dt><dd>{money(pick.budget)} 元</dd>
        </dl>
        {overBudget && <p className={s.over}>每月約 {money(monthly)} 元，超出預算</p>}
        <p className={s.lead}>花費是依體驗中的選擇估算，實際金額會因地區、醫院和貓的狀況而不同。</p>
      </section>

      {good.length > 0 && (
        <section className={s.card} aria-labelledby="good-title">
          <h2 id="good-title">做得好的地方</h2>
          <ul className={s.log}>{good.map((p, i) => <li key={i}><span className={`${s.tag} ${s.ok}`}>做得好</span>{p.t}</li>)}</ul>
        </section>
      )}
      {bad.length > 0 && (
        <section className={s.card} aria-labelledby="bad-title">
          <h2 id="bad-title">可以再想想的地方</h2>
          <ul className={s.log}>{bad.map((p, i) => <li key={i}><span className={s.tag}>可以再想想</span>{p.t}</li>)}</ul>
        </section>
      )}

      <section className={s.card} aria-labelledby="tips-title" aria-live="polite">
        <h2 id="tips-title">給你的建議</h2>
        <ul className={s.log}>{fullAdvice(X, pick, home).map((t, i) => <li key={i}>{t}</li>)}</ul>
        <h3>依你的家補充</h3>
        {tips ? <ul className={s.log}>{tips.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className={s.lead}>正在整理建議…</p>}
      </section>

      <section className={s.card} aria-labelledby="checks-title">
        <h2 id="checks-title">收養之前，問問自己</h2>
        <div className={s.list}>
          {EXP_CHECKS.map((t, i) => (
            <label key={t} className={s.check}>
              <input type="checkbox" checked={checks[i]} onChange={e => setChecks(v => v.map((x, j) => (j === i ? e.target.checked : x)))} />
              {t}
            </label>
          ))}
        </div>
        <p className={s.lead} aria-live="polite">{checksVerdict(nChecked)}</p>
        <p className={s.disclaimer}>{HEALTH_NOTE}{DISCLAIMER}</p>
        <div className={s.actions}>
          <CatButton href={catHref} arrow>前往認養這隻貓</CatButton>
          <CatButton variant="ghost" size="sm" onClick={onRestart}>再玩一次</CatButton>
        </div>
      </section>
    </>
  );
}
