"use client";
// 虛擬飼養 DEMO（#237）：節點的對話框，照 catgame 原版的推進（flow.ts）：台詞（說話的人＋內容）、選項、小叮嚀（page）、這一段的飼養紀錄。
// 小遊戲是原版的對話框，疊在畫面上（PlayGame 處理）。健康相關的台詞旁顯示「僅供參考，非醫療建議」與原版 DISCLAIMER。
import CatButton from "@/components/ui/CatButton";
import { money } from "@/lib/play/costs";
import { ageText } from "@/lib/play/player-data";
import type { Line, PlayState } from "@/lib/play/flow";
import type { Line as PersonalLine } from "@/lib/play/lines";
import { DISCLAIMER, HEALTH_NOTE } from "@/lib/play/report";
import { SPEAKER_NAMES, STORY } from "@/lib/play/story";
import s from "./play.module.css";

const speaker = (who?: string) => (!who || who === "旁白" ? null : SPEAKER_NAMES[who] ?? who);

function Lines({ lines }: { lines: Line[] }) {
  return (
    <div className={s.dialog}>
      {lines.map((l, i) => (
        <p key={i} className={s.line}>
          {speaker(l.who) && <span className={s.speaker}>{speaker(l.who)}</span>}
          <span className={s.text}>{l.t}</span>
        </p>
      ))}
    </div>
  );
}

const Health = () => <p className={s.disclaimer}>{HEALTH_NOTE}{DISCLAIMER}</p>;

export function NodeStep({ state, personal, onNext, onChoose }: {
  state: PlayState;
  /** 個人化台詞（AI 或規則） */
  personal: PersonalLine[];
  onNext: () => void;
  onChoose: (index: number) => void;
}) {
  const node = STORY[state.nodeIndex];
  const cur = state.cur;
  const kicker = <span className={s.kicker}>節點 {state.nodeIndex + 1}／{STORY.length}・{node.label}・{state.life.name}・{ageText(Math.round(state.life.age))}</span>;
  if (!cur) return null;

  if (cur.kind === "log") {
    const X = state.life;
    const picks = X.picks.filter(p => p.node === node.id);
    const notes = X.notes.filter(n => n.node === node.id);
    const events = X.events.filter(e => e.node === node.id);
    const last = X.abandoned || state.nodeIndex + 1 >= STORY.length;
    return (
      <section className={s.card} aria-labelledby="log-title">
        {kicker}
        <h2 id="log-title">這一段的飼養紀錄</h2>
        <ul className={s.log}>
          {events.map(e => <li key={e.id}><span className={s.tag}>發生的事</span>{e.t}</li>)}
          {picks.map((p, i) => (
            <li key={`p${i}`}>
              {p.good !== null && <span className={`${s.tag} ${p.good ? s.ok : ""}`}>{p.good ? "做得好" : "可以再想想"}</span>}
              {p.t}
            </li>
          ))}
          {notes.map((n, i) => <li key={`n${i}`}><span>{n.t}{n.spent && !n.t.includes("元") ? `　${money(n.spent)} 元` : ""}</span></li>)}
        </ul>
        <div className={s.actions}>
          <CatButton onClick={onNext}>{last ? "看試養報告" : node.home ? "回家照顧牠" : "前往下一個節點"}</CatButton>
        </div>
      </section>
    );
  }

  if (cur.kind === "page") {
    return (
      <section className={s.card} aria-labelledby="page-title">
        {kicker}
        <h2 id="page-title">{cur.title}</h2>
        <p className={s.lead}>{cur.tip}</p>
        <div className={s.actions}><CatButton size="sm" onClick={onNext}>繼續</CatButton></div>
      </section>
    );
  }

  if (cur.kind === "ask") {
    return (
      <section className={s.card} aria-label={node.label} aria-live="polite">
        {kicker}
        <Lines lines={[{ who: cur.who, t: cur.t }]} />
        {cur.health && <Health />}
        <div className={s.options}>
          {cur.options.map((o, i) => <button key={i} type="button" className={s.option} onClick={() => onChoose(i)}>{o.l}</button>)}
        </div>
      </section>
    );
  }

  if (cur.kind === "home") return null;

  if (cur.kind === "mini") {
    return (
      <section className={s.card} aria-label={node.label}>
        {kicker}
        <p className={s.lead}>小遊戲進行中。</p>
      </section>
    );
  }

  const lines: Line[] = cur.kind === "personal" ? personal.map(l => ({ who: l.speaker, t: l.text })) : cur.lines;
  return (
    <section className={s.card} aria-label={node.label} aria-live="polite">
      {kicker}
      <Lines lines={lines} />
      {cur.kind === "lines" && cur.lines.some(l => l.health) && <Health />}
      <div className={s.actions}><CatButton size="sm" onClick={onNext}>繼續</CatButton></div>
    </section>
  );
}
