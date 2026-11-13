"use client";
// 貓咪頁的「進行領養任務」按鈕（4 種狀態與彈窗，docs/play-tasks/7-進行中續玩放棄重玩.md 第二節第 1 點）：
//   沒進行中＝進行領養任務；正在做這隻＝繼續領養任務（彈窗：繼續／殘忍放棄）；正在做別隻＝彈窗寫出貓名（繼續他的／放棄，改做這隻）；做完過＝再做一次（確認彈窗寫上次完成時間）。
// 換貓放棄不選原因、不寫放棄標籤（meow_switch_task_run）；在這隻貓按「殘忍放棄」要選原因，中途看得到。
import { useRouter } from "next/navigation";
import { useState } from "react";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import { entryState, runErrorText } from "@/lib/play/run-gate";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { AbandonPanel } from "./AbandonPanel";
import s from "./play-entry.module.css";
import { notifyRunChanged, useActiveRun, useLastDone } from "./useActiveRun";

type Dialog = null | "menu" | "abandon" | "confirm-abandon";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("zh-TW", { year: "numeric", month: "numeric", day: "numeric" });

export function PlayEntry({ catId, catName }: { catId: string; catName: string }) {
  const router = useRouter();
  const active = useActiveRun();
  const lastDone = useLastDone(catId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const play = `/cats/${encodeURIComponent(catId)}/play`;
  const st = entryState({ thisCatId: catId, active: active ?? null, lastDoneAt: lastDone });

  async function switchCat() {
    const sb = getBrowserSupabase();
    if (!sb || st.kind !== "other") return;
    setBusy(true); setError(null);
    const { error: err } = await sb.rpc("meow_switch_task_run", { p_run_id: st.runId });
    setBusy(false);
    if (err) { setError(runErrorText(err.message)); return; }
    notifyRunChanged();
    router.push(play);
  }

  // 還在讀自己的任務時先顯示一般按鈕（照舊連到 /play，那邊會再檢查）
  const click = () => { if (st.kind === "new") router.push(play); else { setError(null); setDialog("menu"); } };

  return (
    <>
      <CatButton onClick={click}>{st.label}</CatButton>
      {dialog === "abandon" && st.kind === "continue" && (
        <div className={s.overlay}><AbandonPanel catName={catName} runId={st.runId} onCancel={() => setDialog("menu")} onDone={() => setDialog(null)} /></div>
      )}
      {dialog && dialog !== "abandon" && (
        <div className={s.overlay} role="presentation" onClick={e => { if (e.target === e.currentTarget) setDialog(null); }}>
          <section className={`${f.card} ${s.dialog}`} role="dialog" aria-modal="true" aria-labelledby="entry-title">
            {st.kind === "continue" && dialog === "menu" && (
              <>
                <h2 id="entry-title">繼續{catName}的領養任務</h2>
                <p className={f.lead}>你已經開始了{catName}的任務，可以從上次的節點接著玩。</p>
                <div className={f.actions}>
                  <CatButton href={play}>繼續任務</CatButton>
                  <CatButton variant="ghost" onClick={() => setDialog("confirm-abandon")}>殘忍放棄</CatButton>
                </div>
              </>
            )}
            {st.kind === "continue" && dialog === "confirm-abandon" && (
              <>
                <h2 id="entry-title">真的要放棄{catName}嗎？</h2>
                <p className={f.lead}>{catName}的中途會看到你放棄過這隻貓的領養任務，以及你選的原因。</p>
                <div className={f.actions}>
                  <CatButton onClick={() => setDialog("abandon")}>選擇原因並放棄</CatButton>
                  <CatButton variant="ghost" onClick={() => setDialog("menu")}>先不要</CatButton>
                </div>
              </>
            )}
            {st.kind === "other" && (
              <>
                <h2 id="entry-title">你正在進行{st.catName}的領養任務</h2>
                <p className={f.lead}>同時只能進行一隻貓的領養任務。要先回去完成{st.catName}的任務，或放棄後改做{catName}的。</p>
                {error && <p className={f.error} role="alert">{error}</p>}
                <div className={f.actions}>
                  <CatButton href={`/cats/${encodeURIComponent(st.catId)}/play`}>繼續{st.catName}的任務</CatButton>
                  <CatButton variant="ghost" disabled={busy} onClick={switchCat}>{busy ? "處理中…" : `放棄，改做${catName}的`}</CatButton>
                </div>
              </>
            )}
            {st.kind === "again" && (
              <>
                <h2 id="entry-title">再做一次{catName}的領養任務？</h2>
                <p className={f.lead}>你上次在 {st.lastDoneAt ? fmt(st.lastDoneAt) : "之前"} 完成。再做一次會多留一筆試養報告，{catName}的中途看得到你做過幾次。</p>
                <div className={f.actions}>
                  <CatButton href={play}>再做一次</CatButton>
                  <CatButton variant="ghost" onClick={() => setDialog(null)}>先不要</CatButton>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
