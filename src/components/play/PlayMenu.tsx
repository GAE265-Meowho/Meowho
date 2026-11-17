"use client";
// 虛擬飼養右上角的齒輪鈕（#354，渝茜 2026-11-14）：原本的聲音、放棄、離開三顆鈕收成一顆。
// 按下去畫面變暗、跳出設定視窗：聲音開關、離開（說明下次從哪裡接著玩）、放棄這次任務（有進行中的紀錄才有）。
// 視窗本身就是確認，離開不再跳瀏覽器的 confirm。Esc、點暗處、「繼續玩」都會關掉。
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import CatButton from "@/components/ui/CatButton";
import { getBgmVolume, getSfxVolume, isMuted, playSfx, setBgmVolume, setMuted, setSfxVolume, subscribeMuted, unlockAudio } from "@/lib/play/audio-player";
import m from "./menu.module.css";

const Gear = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);

export function PlayMenu({ exitHref, exitNote, onAbandon }: {
  exitHref: string;
  /** 離開時下次從哪裡接著玩（顯示在離開鈕上方） */
  exitNote: string;
  /** 有進行中的紀錄才給：按了開放棄面板 */
  onAbandon?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  // #456：背景音樂、音效各自一條音量
  const bgmVol = useSyncExternalStore(subscribeMuted, getBgmVolume, () => 1);
  const sfxVol = useSyncExternalStore(subscribeMuted, getSfxVolume, () => 1);

  useEffect(() => {
    const d = ref.current;
    if (!open || !d || d.open) return;
    try { d.showModal(); } catch { d.setAttribute("open", ""); }
  }, [open]);
  const close = () => { ref.current?.close(); setOpen(false); btn.current?.focus(); };

  return (
    <>
      <button ref={btn} type="button" className={m.gear} aria-label="設定" aria-haspopup="dialog" onClick={() => setOpen(true)}><Gear /></button>
      {open && (
        <dialog ref={ref} className={m.dialog} aria-labelledby="play-menu-title"
          onCancel={ev => { ev.preventDefault(); close(); }}
          onClick={ev => { if (ev.target === ref.current) close(); }}>
          <h2 id="play-menu-title" className={m.title}>設定</h2>
          <label className={m.row}>
            <span>聲音</span>
            <input type="checkbox" role="switch" className={m.switch} checked={!muted}
              onChange={ev => { unlockAudio(); setMuted(!ev.target.checked); }} />
          </label>
          <label className={m.row}>
            <span>背景音樂</span>
            <input type="range" className={m.slider} min={0} max={100} step={5} value={Math.round(bgmVol * 100)} aria-label="背景音樂音量" disabled={muted}
              onChange={ev => { unlockAudio(); setBgmVolume(Number(ev.target.value) / 100); }} />
          </label>
          <label className={m.row}>
            <span>音效</span>
            <input type="range" className={m.slider} min={0} max={100} step={5} value={Math.round(sfxVol * 100)} aria-label="音效音量" disabled={muted}
              onChange={ev => { unlockAudio(); setSfxVolume(Number(ev.target.value) / 100); }}
              onPointerUp={() => playSfx("sfx_done")} onKeyUp={() => playSfx("sfx_done")} />
          </label>
          <p className={m.note}>{exitNote}</p>
          <div className={m.actions}>
            <CatButton onClick={close}>繼續玩</CatButton>
            <CatButton variant="ghost" href={exitHref}>離開</CatButton>
            {onAbandon && <button type="button" className={m.abandon} onClick={() => { close(); onAbandon(); }}>放棄這次任務</button>}
          </div>
        </dialog>
      )}
    </>
  );
}
