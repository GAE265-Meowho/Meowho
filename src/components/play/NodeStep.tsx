"use client";
// 虛擬飼養 DEMO（#237、#354 改版）：節點的對話框，照 catgame 原版的推進（flow.ts）：台詞、選項、小叮嚀（page）、這一段的飼養紀錄。
// 版面（#354）：貼底、約畫面三分之一；一次只顯示一句，點對話框或按「繼續」（Enter／Space）看下一句，這張卡看完才 onNext；
//   說話的人有圓形頭像＋名牌，旁白沒有頭像、字色較淡；節點進度是一排貓掌。純邏輯在 lib/play/dialog.ts。
// 小遊戲是原版的對話框，疊在畫面上（PlayGame 處理）。健康相關的台詞旁顯示「僅供參考，非醫療建議」與原版 DISCLAIMER。
import { useMemo, useState } from "react";
import CatButton from "@/components/ui/CatButton";
import { money } from "@/lib/play/costs";
import { nextBeat, pawSteps, progressLabel, voiceOf } from "@/lib/play/dialog";
import { ageText } from "@/lib/play/player-data";
import type { Line, PlayState } from "@/lib/play/flow";
import type { Line as PersonalLine } from "@/lib/play/lines";
import { DISCLAIMER, HEALTH_NOTE } from "@/lib/play/report";
import { STORY } from "@/lib/play/story";
import { Glyph, type GlyphId, Paw, SpeakerAvatar } from "./SpeakerAvatar";
import n from "./node.module.css";

const Health = () => <p className={n.health}><Glyph id="health" /><span>{HEALTH_NOTE}{DISCLAIMER}</span></p>;

/** 一句台詞：說話的人（頭像＋名牌）或旁白 */
function Say({ who, t, catName }: { who?: string; t: string; catName: string }) {
  const v = voiceOf(who, catName);
  return (
    <div className={n.say} data-narrator={v.narrator ? "true" : undefined}>
      {v.avatar && (
        <p className={n.who}><SpeakerAvatar id={v.avatar} size={44} /><span className={n.name}>{v.name}</span></p>
      )}
      <p className={n.text}>{t}</p>
    </div>
  );
}

/** 對話框外殼：上緣是節點進度（貓掌）與貓齡小標 */
function Box({ state, label, labelledBy, tall, onTap, children }: {
  state: PlayState; label?: string; labelledBy?: string; tall?: boolean; onTap?: () => void; children: React.ReactNode;
}) {
  const age = ageText(Math.round(state.life.age));
  return (
    // 點對話框任意處＝按「繼續」；鍵盤走裡面的「繼續」按鈕（同一個 click 事件往上傳到這裡）
    <section className={n.box} aria-label={label} aria-labelledby={labelledBy} data-tall={tall ? "true" : undefined} data-tap={onTap ? "true" : undefined} onClick={onTap}>
      <div className={n.head}>
        <span className={n.paws} role="img" aria-label={progressLabel(state.nodeIndex, STORY.length)}>
          {pawSteps(state.nodeIndex, STORY.length).map((p, i) => <Paw key={i} state={p} />)}
        </span>
        {age && <span className={n.age}>貓齡 {age}</span>}
      </div>
      {children}
    </section>
  );
}

/** 一張卡的台詞，一次一句 */
function Beats({ state, lines, label, onDone }: { state: PlayState; lines: Line[]; label: string; onDone: () => void }) {
  const [src, setSrc] = useState(lines);
  const [at, setAt] = useState(0);
  if (src !== lines) { setSrc(lines); setAt(0); }
  const i = src !== lines ? 0 : Math.min(at, Math.max(0, lines.length - 1));
  const l = lines[i];
  const go = () => { const r = nextBeat(i, lines.length); if (r.done) onDone(); else setAt(r.index); };
  return (
    <Box state={state} label={label} tall={Boolean(l?.health)} onTap={go}>
      <div className={n.live} aria-live="polite">
        {l && (
          <div key={i} className={n.beat}>
            <Say who={l.who} t={l.t} catName={state.life.name} />
            {l.health && <Health />}
          </div>
        )}
      </div>
      <div className={n.foot}>
        {lines.length > 1 && (
          <span className={n.pips} aria-hidden="true">{lines.map((_, k) => <i key={k} data-on={k <= i ? "true" : undefined} />)}</span>
        )}
        <CatButton size="sm">繼續</CatButton>
      </div>
    </Box>
  );
}

const LOG_KINDS: Record<"event" | "good" | "think" | "note", { icon: GlyphId; label: string }> = {
  event: { icon: "event", label: "發生的事" },
  good: { icon: "good", label: "做得好" },
  think: { icon: "think", label: "可以再想想" },
  note: { icon: "note", label: "紀錄" },
};
function LogItem({ kind, children }: { kind: keyof typeof LOG_KINDS; children: React.ReactNode }) {
  const k = LOG_KINDS[kind];
  return (
    <li data-kind={kind}>
      <span className={n.logIcon}><Glyph id={k.icon} size={22} /></span>
      <span className={n.logBody}><b>{k.label}</b><span>{children}</span></span>
    </li>
  );
}

export function NodeStep({ state, personal, onNext, onChoose }: {
  state: PlayState;
  /** 個人化台詞（AI 或規則） */
  personal: PersonalLine[];
  onNext: () => void;
  onChoose: (index: number) => void;
}) {
  const node = STORY[state.nodeIndex];
  const cur = state.cur;
  // 同一張卡要給 Beats 同一個陣列（它靠陣列有沒有換來判斷要不要從第一句開始）
  const lines = useMemo<Line[]>(
    () => (cur?.kind === "personal" ? personal.map(l => ({ who: l.speaker, t: l.text })) : cur?.kind === "lines" ? cur.lines : []),
    [cur, personal],
  );
  if (!cur) return null;

  if (cur.kind === "log") {
    const X = state.life;
    const picks = X.picks.filter(p => p.node === node.id);
    const notes = X.notes.filter(x => x.node === node.id);
    const events = X.events.filter(e => e.node === node.id);
    const last = X.abandoned || state.nodeIndex + 1 >= STORY.length;
    return (
      <Box state={state} labelledBy="log-title" tall>
        <h2 id="log-title" className={n.title}><Glyph id="note" size={24} />這一段的飼養紀錄</h2>
        <ul className={n.log}>
          {events.map(e => <LogItem key={e.id} kind="event">{e.t}</LogItem>)}
          {picks.map((p, i) => <LogItem key={`p${i}`} kind={p.good === null ? "note" : p.good ? "good" : "think"}>{p.t}</LogItem>)}
          {notes.map((x, i) => <LogItem key={`n${i}`} kind="note">{x.t}{x.spent && !x.t.includes("元") ? `　${money(x.spent)} 元` : ""}</LogItem>)}
        </ul>
        <div className={n.foot}>
          <CatButton onClick={onNext}>{last ? "看試養報告" : node.home ? "回家照顧牠" : "前往下一個節點"}</CatButton>
        </div>
      </Box>
    );
  }

  if (cur.kind === "page") {
    return (
      <Box state={state} labelledBy="page-title" tall>
        <p className={n.tipTag}><Glyph id="tip" />小叮嚀</p>
        <h2 id="page-title" className={n.title}>{cur.title}</h2>
        <p className={n.text}>{cur.tip}</p>
        <div className={n.foot}><CatButton size="sm" onClick={onNext}>繼續</CatButton></div>
      </Box>
    );
  }

  if (cur.kind === "ask") {
    return (
      <Box state={state} label={node.label} tall>
        <div className={n.live} aria-live="polite">
          <Say who={cur.who} t={cur.t} catName={state.life.name} />
          {cur.health && <Health />}
        </div>
        <div className={n.options} role="group" aria-label="你的選擇">
          {cur.options.map((o, i) => (
            <button key={i} type="button" className={n.option} onClick={() => onChoose(i)}>
              <Paw state="done" /><span>{o.l}</span>
            </button>
          ))}
        </div>
      </Box>
    );
  }

  if (cur.kind === "home" || cur.kind === "relocate") return null;

  if (cur.kind === "mini" && cur.mini === "play") return null;
  if (cur.kind === "mini") {
    return <Box state={state} label={node.label}><p className={n.text}>小遊戲進行中。</p></Box>;
  }

  return <Beats state={state} lines={lines} label={node.label} onDone={onNext} />;
}
