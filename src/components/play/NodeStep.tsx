"use client";
// 虛擬飼養 DEMO（#237、#354 改版）：節點的對話框，照 catgame 原版的推進（flow.ts）：台詞、選項、小叮嚀（page）、這一段的飼養紀錄。
// 版面（#354）：貼底、約畫面三分之一，對話框不捲動（放不下就分頁，見 lib/play/dialog-fit.ts）；一次只顯示一句，點對話框或按「繼續」（Enter／Space）看下一句，這張卡看完才 onNext；
//   說話的人有圓形頭像＋名牌，旁白沒有頭像、字色較淡；節點進度是一排貓掌。純邏輯在 lib/play/dialog.ts。
// 小遊戲是原版的對話框，疊在畫面上（PlayGame 處理）。健康相關的台詞旁顯示「僅供參考，非醫療建議」與原版 DISCLAIMER。
import { useMemo, useState, useSyncExternalStore } from "react";
import CatButton from "@/components/ui/CatButton";
import { money } from "@/lib/play/costs";
import { nextBeat, pawSteps, progressLabel, voiceOf } from "@/lib/play/dialog";
import { boxInner, chipLabel, estimateTextWidth, fitBudget, healthHeight, healthOwnPage, LOG_LABELS, type LogKind, logSummary, optionPages, packRows, pageBreaks, sayHeight } from "@/lib/play/dialog-fit";
import { ageText } from "@/lib/play/player-data";
import type { Line, PlayState } from "@/lib/play/flow";
import type { Line as PersonalLine } from "@/lib/play/lines";
import { DISCLAIMER, HEALTH_NOTE } from "@/lib/play/report";
import { STORY } from "@/lib/play/story";
import { Glyph, type GlyphId, Paw, SpeakerAvatar } from "./SpeakerAvatar";
import n from "./node.module.css";

// 健康聲明：完整版（HEALTH_NOTE＋DISCLAIMER）；畫面放不下時完整版自己一頁，其他頁留短的「僅供參考，非醫療建議」
const Health = ({ short }: { short?: boolean }) => <p className={n.health}><Glyph id="health" /><span>{HEALTH_NOTE}{short ? "" : DISCLAIMER}</span></p>;

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
function Box({ state, label, labelledBy, onTap, children }: {
  state: PlayState; label?: string; labelledBy?: string; onTap?: () => void; children: React.ReactNode;
}) {
  const age = ageText(Math.round(state.life.age));
  return (
    // 點對話框任意處＝按「繼續」；鍵盤走裡面的「繼續」按鈕（同一個 click 事件往上傳到這裡）
    <section className={n.box} aria-label={label} aria-labelledby={labelledBy} data-tap={onTap ? "true" : undefined} onClick={onTap}>
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

/** 一張卡的台詞，一次一句；健康聲明放不下時拆成「台詞＋短聲明」與「完整聲明」兩拍 */
function Beats({ state, lines, label, onDone }: { state: PlayState; lines: Line[]; label: string; onDone: () => void }) {
  const view = useView();
  const beats = useMemo(() => lines.flatMap((l): { l: Line; health: "none" | "full" | "short" | "only" }[] => {
    if (!l.health) return [{ l, health: "none" }];
    if (view && healthOwnPage(view.w, view.h, l.t, HEALTH_NOTE + DISCLAIMER, 0)) return [{ l, health: "short" as const }, { l, health: "only" }];
    return [{ l, health: "full" }];
  }), [lines, view]);
  const [i, setAt] = usePage(lines, beats.length);
  const b = beats[i];
  const go = () => { const r = nextBeat(i, beats.length); if (r.done) onDone(); else setAt(r.index); };
  return (
    <Box state={state} label={label} onTap={go}>
      <div className={n.live} aria-live="polite">
        {b && (
          <div key={i} className={n.beat}>
            {b.health !== "only" && <Say who={b.l.who} t={b.l.t} catName={state.life.name} />}
            {b.health !== "none" && <Health short={b.health === "short"} />}
          </div>
        )}
      </div>
      <div className={n.foot}>
        {beats.length > 1 && (
          <span className={n.pips} aria-hidden="true">{beats.map((_, k) => <i key={k} data-on={k <= i ? "true" : undefined} />)}</span>
        )}
        <CatButton size="sm">繼續</CatButton>
      </div>
    </Box>
  );
}

// 對話框不捲動（#354）：依視窗大小估算一頁放得下多少，放不下就分頁。伺服器端沒有視窗＝不分頁
const subscribeView = (f: () => void) => { window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); };
function useView(): { w: number; h: number } | null {
  const v = useSyncExternalStore(subscribeView, () => `${window.innerWidth}x${window.innerHeight}`, () => "");
  if (!v) return null;
  const [w, h] = v.split("x").map(Number);
  return { w, h };
}

/** 分頁的目前頁：換一組內容（key 變了）就回第一頁 */
function usePage(key: unknown, total: number): [number, (i: number) => void] {
  const [st, setSt] = useState({ key, at: 0 });
  if (st.key !== key) setSt({ key, at: 0 });
  const at = st.key !== key ? 0 : Math.min(st.at, Math.max(0, total - 1));
  return [at, (i: number) => setSt({ key, at: i })];
}

const LOG_ICONS: Record<LogKind, GlyphId> = { event: "event", good: "good", think: "think", note: "note" };
const FS_BODY = 17, FS_SUB = 15, FS_H = 20;
const CHIP_H = 38, CHIP_GAP = 6;

/** 這一段的飼養紀錄：一行小結＋小晶片（圖示＋短句），放不下就分頁 */
function LogCard({ state, items, cta, onNext }: {
  state: PlayState; items: { kind: LogKind; t: string }[]; cta: string; onNext: () => void;
}) {
  const view = useView();
  const counts = { event: 0, good: 0, think: 0, note: 0 };
  items.forEach(i => { counts[i.kind] += 1; });
  const summary = logSummary(counts);
  const pages = useMemo(() => {
    if (!view) return [items.map((_, i) => i)];
    const inner = boxInner(view.w);
    const rows = packRows(items.map(i => estimateTextWidth(chipLabel(i.t), FS_SUB) + 50), inner, CHIP_GAP);
    const titleLines = Math.ceil((estimateTextWidth(`這一段 ${summary}`, FS_H) + 32) / inner);
    // 外框內距與邊框、貓掌列、標題、按鈕列、間距
    const chrome = (view.w >= 900 ? 32 : 24) + 4 + 24 + titleLines * FS_H * 1.45 + 60 + 30;
    return pageBreaks(rows.map(() => CHIP_H), Math.max(CHIP_H, fitBudget(view.h, 0.4, view.w) - chrome), CHIP_GAP)
      .map(p => p.flatMap(r => rows[r]));
  }, [view, items, summary]);
  const [at, setAt] = usePage(items, pages.length);
  const more = at < pages.length - 1;
  return (
    <Box state={state} labelledBy="log-title">
      <h2 id="log-title" className={n.logTitle}>
        <Glyph id="note" size={22} /><span>這一段</span>{summary && <span className={n.logSum}>{summary}</span>}
      </h2>
      <ul className={n.chips} aria-label="這一段的飼養紀錄">
        {(pages[at] ?? []).map(k => {
          const it = items[k];
          return (
            <li key={k} className={n.chip} data-kind={it.kind} title={it.t}>
              <Glyph id={LOG_ICONS[it.kind]} size={18} /><span className={n.srOnly}>{LOG_LABELS[it.kind]}：</span><span>{chipLabel(it.t)}</span>
            </li>
          );
        })}
      </ul>
      <div className={n.foot}>
        {pages.length > 1 && <span className={n.pips} aria-hidden="true">{pages.map((_, k) => <i key={k} data-on={k <= at ? "true" : undefined} />)}</span>}
        {more
          ? <CatButton size="sm" onClick={() => setAt(nextBeat(at, pages.length).index)}>繼續</CatButton>
          : <CatButton onClick={onNext}>{cta}</CatButton>}
      </div>
    </Box>
  );
}

/** 選項：寬畫面兩欄；放不下就分頁，用「其他選項」輪流看 */
function AskCard({ state, cur, label, onChoose }: {
  state: PlayState; cur: Extract<NonNullable<PlayState["cur"]>, { kind: "ask" }>; label: string; onChoose: (index: number) => void;
}) {
  const view = useView();
  const labels = useMemo(() => cur.options.map(o => o.l), [cur]);
  // 健康聲明太長：第一頁是台詞＋完整聲明（按「繼續」），之後的選項頁留短聲明
  const split = Boolean(cur.health && view && healthOwnPage(view.w, view.h, cur.t, HEALTH_NOTE + DISCLAIMER));
  const fit = useMemo(() => {
    if (!view) return { cols: (labels.length > 1 ? 2 : 1) as 1 | 2, pages: [labels.map((_, i) => i)] };
    const inner = boxInner(view.w);
    const health = cur.health ? healthHeight(split ? HEALTH_NOTE : HEALTH_NOTE + DISCLAIMER, inner) : 0;
    const chrome = (view.w >= 900 ? 32 : 24) + 4 + 24 + sayHeight(cur.t, inner) + health + 30;
    const avail = fitBudget(view.h, 0.5, view.w) - chrome;
    const one = optionPages(labels, inner, avail, FS_BODY);
    return one.pages.length > 1 ? optionPages(labels, inner, avail - 56, FS_BODY) : one;
  }, [view, labels, cur, split]);
  const [step, setStep] = usePage(cur, fit.pages.length + (split ? 1 : 0));
  const intro = split && step === 0;
  const at = step - (split ? 1 : 0);
  return (
    <Box state={state} label={label} onTap={intro ? () => setStep(1) : undefined}>
      <div className={n.live} aria-live="polite">
        <Say who={cur.who} t={cur.t} catName={state.life.name} />
        {cur.health && <Health short={split && !intro} />}
      </div>
      {intro ? (
        <div className={n.foot}><CatButton size="sm">繼續</CatButton></div>
      ) : (
        <>
          <div className={n.options} data-cols={fit.cols} role="group" aria-label="你的選擇">
            {(fit.pages[at] ?? []).map(i => (
              <button key={i} type="button" className={n.option} onClick={() => onChoose(i)}>
                <Paw state="done" /><span>{cur.options[i].l}</span>
              </button>
            ))}
          </div>
          {fit.pages.length > 1 && (
            <div className={n.foot}>
              <span className={n.pips} aria-hidden="true">{fit.pages.map((_, k) => <i key={k} data-on={k === at ? "true" : undefined} />)}</span>
              <CatButton size="sm" variant="ghost" onClick={() => setStep((split ? 1 : 0) + (at + 1) % fit.pages.length)}>其他選項</CatButton>
            </div>
          )}
        </>
      )}
    </Box>
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
    const items: { kind: LogKind; t: string }[] = [
      ...events.map(e => ({ kind: "event" as const, t: e.t })),
      ...picks.map(p => ({ kind: (p.good === null ? "note" : p.good ? "good" : "think") as LogKind, t: p.t })),
      ...notes.map(x => ({ kind: "note" as const, t: `${x.t}${x.spent && !x.t.includes("元") ? `　${money(x.spent)} 元` : ""}` })),
    ];
    return <LogCard key={node.id} state={state} items={items} cta={last ? "看試養報告" : node.home ? "回家照顧牠" : "前往下一個節點"} onNext={onNext} />;
  }

  if (cur.kind === "page") {
    return (
      <Box state={state} labelledBy="page-title">
        <p className={n.tipTag}><Glyph id="tip" />小叮嚀</p>
        <h2 id="page-title" className={n.title}>{cur.title}</h2>
        <p className={n.text}>{cur.tip}</p>
        <div className={n.foot}><CatButton size="sm" onClick={onNext}>繼續</CatButton></div>
      </Box>
    );
  }

  if (cur.kind === "ask") return <AskCard state={state} cur={cur} label={node.label} onChoose={onChoose} />;

  if (cur.kind === "home" || cur.kind === "relocate") return null;

  if (cur.kind === "mini" && cur.mini === "play") return null;
  if (cur.kind === "mini") {
    return <Box state={state} label={node.label}><p className={n.text}>小遊戲進行中。</p></Box>;
  }

  return <Beats state={state} lines={lines} label={node.label} onDone={onNext} />;
}
