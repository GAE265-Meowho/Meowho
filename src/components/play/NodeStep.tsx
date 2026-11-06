"use client";
// 虛擬飼養 DEMO（#237）：節點的對話框（主線台詞＋選項＋回饋）與這一段的飼養紀錄。小遊戲疊在 3D 舞台上（PlayGame 處理）。
// 健康相關段落旁邊顯示「僅供參考，非醫療建議」（業務規則要求的聲明，不算小字備註）。
import CatButton from "@/components/ui/CatButton";
import { formatNT } from "@/lib/play/costs";
import { currentBeat, type PlayState } from "@/lib/play/flow";
import type { MiniResult } from "@/lib/play/minigames";
import { fillPlaces, type Places } from "@/lib/play/room";
import { DISCLAIMER, STORY, type Line } from "@/lib/play/story";
import s from "./play.module.css";

const stars = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

export function NodeStep({ state, places, catName, personal, flash, onNext, onChoose }: {
  state: PlayState;
  places: Places;
  catName: string;
  /** 個人化台詞（AI 或規則） */
  personal: Line[];
  /** 剛完成的小遊戲結果 */
  flash: MiniResult | null;
  onNext: () => void;
  onChoose: (index: number) => void;
}) {
  const node = STORY[state.nodeIndex];
  const fill = (t: string) => fillPlaces(t, places, catName);
  const last = state.nodeIndex + 1 >= STORY.length;
  const kicker = <span className={s.kicker}>節點 {state.nodeIndex + 1}／{STORY.length}・{node.title}</span>;

  if (state.phase === "log") {
    const choices = state.choices.filter(c => c.nodeId === node.id);
    const minis = state.minis.filter(m => m.nodeId === node.id);
    return (
      <section className={s.card} aria-labelledby="log-title">
        {kicker}
        <h2 id="log-title">這一段的飼養紀錄</h2>
        <ul className={s.log}>
          {choices.map(c => (
            <li key={c.beatId}>
              <span className={`${s.tag} ${c.option.good ? s.ok : ""}`}>{c.event ? "居家事件" : c.option.good ? "建議做法" : "可以更好"}</span>
              <strong>{fill(c.prompt)}</strong>
              {fill(c.option.text)}
              {c.option.cost && <span>花費 {formatNT(c.option.cost.amount)}（{c.option.cost.category === "medical" ? "醫療" : c.option.cost.category === "accident" ? "意外" : "一次性"}）</span>}
            </li>
          ))}
          {minis.map(m => <li key={m.id}><strong>小遊戲 {stars(m.stars)}</strong>{m.text}</li>)}
        </ul>
        <div className={s.actions}>
          <CatButton onClick={onNext}>{last ? "看試養報告" : "前往下一個節點"}</CatButton>
        </div>
      </section>
    );
  }

  const beat = currentBeat(state);
  if (!beat) return null;
  const lines = beat.personal ? personal : beat.lines;
  const picked = state.picked !== null ? beat.options?.[state.picked] : null;

  return (
    <section className={s.card} aria-label={node.title} aria-live="polite">
      {kicker}
      {flash && <p className={s.disclaimer}>小遊戲 {stars(flash.stars)}：{flash.text}</p>}
      <div className={s.dialog}>
        {lines.map((l, i) => (
          <p key={i} className={s.line} data-narrator={l.speaker === "旁白"}>
            {l.speaker !== "旁白" && <span className={s.speaker}>{fill(l.speaker)}</span>}
            <span className={s.text}>{fill(l.text)}</span>
          </p>
        ))}
      </div>
      {beat.health && <p className={s.disclaimer}>{DISCLAIMER}</p>}

      {state.phase === "choice" && beat.options && (
        <>
          <h3>{fill(beat.prompt ?? "")}</h3>
          <div className={s.options}>
            {beat.options.map((o, i) => (
              <button key={i} type="button" className={s.option} onClick={() => onChoose(i)}>{fill(o.text)}</button>
            ))}
          </div>
        </>
      )}
      {state.phase === "feedback" && picked && (
        <div className={`${s.feedback} ${picked.good ? s.good : ""}`}>
          <p><strong>{picked.good ? "很好！" : "可以更好"}</strong></p>
          <p>{fill(picked.feedback)}</p>
          {picked.cost && <p>這次花了 {formatNT(picked.cost.amount)}。</p>}
        </div>
      )}
      {state.phase === "mini" && <p className={s.lead}>在上面的畫面完成小遊戲。</p>}
      {(state.phase === "lines" || state.phase === "feedback") && (
        <div className={s.actions}>
          <CatButton onClick={onNext} size="sm">{state.phase === "lines" && beat.options?.length ? "要怎麼做？" : "繼續"}</CatButton>
        </div>
      )}
    </section>
  );
}
