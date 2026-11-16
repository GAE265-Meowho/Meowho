"use client";
// 對話框裡的領養任務狀態（規格 09 §7.4）：資料來自 0017 的 meow_thread_task_status。
// 中途看到：系統認證（完成過這隻貓的任務）、附上的試養報告、放棄任務標籤；領養人看到自己的完成狀態，可以「附上試養報告」。
// 放棄任務標籤只有中途拿得到，領養人自己的畫面不顯示（資料庫也不回）。
import { useEffect, useState } from "react";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { parseContent } from "@/lib/adoption-tasks";
import { CostCard, MoodScales, PickZone } from "@/components/play/ReportParts";
import p from "@/components/play/report.module.css";
import { money } from "@/lib/play/costs";
import { parsePlayReport, type PlayReport } from "@/lib/play/report-payload";
import { trustWord } from "@/lib/play/report";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { parseProgress, proofLines, reasonLabel } from "@/lib/task-run";
import s from "./desk.module.css";

interface Status {
  completed: boolean; completed_at: string | null;
  proof: { run_id: string; summary: string | null; progress: unknown; shared_at: string | null; tasks: unknown; game_report?: unknown } | null;
  abandons: { reasons: string[]; note: string | null; day: number | null; at: string }[] | null;
}
const date = (iso: string) => new Date(iso).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });

const COST_LABELS = { once: "一次性花費", month: "每月花費累計", med: "醫療費", acc: "意外花費", other: "其他" } as const;

/** 虛擬飼養的試養報告（0033）：信任壓力量表、花費摘要卡、做得好／可以再想想分區；沒有家裡位置、物件清單與裁切照 */
function GameReport({ r }: { r: PlayReport }) {
  const good = r.picks.filter(p => p.good === true), bad = r.picks.filter(p => p.good === false), plain = r.picks.filter(p => p.good === null);
  const rounds = r.care.rounds ? `${r.care.rounds} 輪，共做了 ${Object.values(r.care.log).reduce((a, b) => a + b, 0)} 次照顧` : "沒有做在家的照顧";
  return (
    <div className={p.hero}>
      <h3 className={p.zoneTitle}>試養了 {r.years} 年，{r.catName}對你：{trustWord(r.trust)}</h3>
      <MoodScales trust={r.trust} stress={r.stress} />
      <CostCard title="花費總共約" total={r.cost.total} cost={r.cost} labels={COST_LABELS}>
        <div><dt>每月固定約</dt><dd>{money(r.monthly)} 元</dd></div>
        {r.budget > 0 && <div><dt>預算</dt><dd>{money(r.budget)} 元</dd></div>}
      </CostCard>
      {r.overBudget && <p className={p.over}>每月花費超出預算</p>}
      {r.events.length > 0 && <PickZone tone="plain" title="發生的事" items={r.events} />}
      <div className={p.zones}>
        <PickZone tone="good" title="做得好" items={good.map(x => x.t)} />
        <PickZone tone="think" title="可以再想想" items={bad.map(x => x.t)} />
      </div>
      <PickZone tone="plain" title="其他選擇" items={plain.map(x => x.t)} />
      <PickZone tone="plain" title="照顧紀錄" items={[rounds]} />
    </div>
  );
}

export function TaskProof({ threadId, catId, catName, isKeeper, showHint, refresh, onShared }: {
  threadId: string; catId: string; catName: string; isKeeper: boolean; showHint: boolean; refresh: number; onShared: () => void;
}) {
  const sb = getBrowserSupabase();
  const [st, setSt] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb?.rpc("meow_thread_task_status", { p_thread_id: threadId }).then(({ data }) => setSt((data as Status | null) ?? null));
  }, [sb, threadId, refresh]);

  if (!st) return null;
  const game = st.proof ? parsePlayReport(st.proof.game_report) : null;
  const lines = st.proof && !game ? proofLines(parseContent({ tasks: st.proof.tasks }), parseProgress(st.proof.progress)) : [];
  const abandons = st.abandons ?? [];

  async function share() {
    if (!sb || !st?.proof) return;
    setBusy(true);
    const { error } = await sb.rpc("meow_share_task_proof", { p_run_id: st.proof.run_id });
    setBusy(false);
    if (!error) onShared();
  }

  if (!st.completed && !abandons.length) {
    return isKeeper || !showHint ? null : (
      <p className={s.taskHint}>還沒完成{catName}的領養任務。完成任務會影響中途的判斷，<a href={`/cats/${catId}/play`}>去做任務</a>。</p>
    );
  }

  return (
    <div className={s.taskProof}>
      <ul className={s.badges} aria-label="領養任務">
        {st.completed && <li className={s.verified}><Icon name="check" size={16} />系統認證：已完成「{catName}」的領養任務{st.completed_at ? `（${date(st.completed_at)}）` : ""}</li>}
        {isKeeper && abandons.map(a => (
          <li key={a.at} className={s.abandon}>
            放棄過領養任務：{a.reasons.map(reasonLabel).join("、")}{a.note ? `（${a.note}）` : ""}{a.day ? `，做到第 ${a.day} 天` : ""}・{date(a.at)}
          </li>
        ))}
      </ul>
      {st.proof && (isKeeper || st.proof.shared_at) && (game || lines.length > 0) && (
        <>
          <button type="button" className={s.toggle} aria-expanded={open} onClick={() => setOpen(v => !v)}>
            試養報告<span aria-hidden>{open ? "收合" : "展開"}</span>
          </button>
          {open && game && <GameReport r={game} />}
          {open && !game && (
            <ul className={s.proofList}>
              {lines.map(l => <li key={`${l.day}-${l.title}`}><b>第 {l.day} 天・{l.title}</b><span>{l.chosen}{l.tries > 1 ? `（重選 ${l.tries - 1} 次）` : ""}</span></li>)}
            </ul>
          )}
          {st.proof.summary && <p className={f.lead}>{st.proof.summary}</p>}
        </>
      )}
      {!isKeeper && st.proof && !st.proof.shared_at && (
        <div className={f.actions}><CatButton size="sm" disabled={busy} onClick={share}>附上試養報告</CatButton></div>
      )}
    </div>
  );
}
