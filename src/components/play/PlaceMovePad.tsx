"use client";
// 擺用品（掃描房間）：選中已放好的用品時，在卡片裡出現「物件移動」鈕（#354）。
// 上下左右依目前鏡頭的視角換算（按「右」＝畫面上的右邊），另有「轉 90°」；按住可連續移動。
// 鍵盤：方向鍵移動、R 旋轉（在 window 的捕獲階段先處理，PlayStage 的「方向鍵切換視角」就不會同時觸發）。
import { useEffect, useRef } from "react";
import { PLACE_EDIT, type MoveDir } from "@/lib/play/scan-place";
import m from "./place.module.css";

const DIRS: { dir: MoveDir; word: string; turn: number; key: string }[] = [
  { dir: "up", word: "往上", turn: 0, key: "ArrowUp" },
  { dir: "left", word: "往左", turn: -90, key: "ArrowLeft" },
  { dir: "right", word: "往右", turn: 90, key: "ArrowRight" },
  { dir: "down", word: "往下", turn: 180, key: "ArrowDown" },
];

/** 按一下動一步；按住超過 repeatDelayMs 後每 repeatMs 再動一步，放開停止 */
function useRepeat() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const start = (act: () => boolean) => {
    stop();
    if (!act()) return;
    const loop = () => { timer.current = act() ? setTimeout(loop, PLACE_EDIT.repeatMs) : null; };
    timer.current = setTimeout(loop, PLACE_EDIT.repeatDelayMs);
  };
  useEffect(() => stop, []);
  return { start, stop };
}

export function PlaceMovePad({ name, onNudge, onRotate }: { name: string; onNudge: (dir: MoveDir) => boolean; onRotate: () => boolean }) {
  const { start, stop } = useRepeat();
  const nudge = useRef(onNudge);
  nudge.current = onNudge;
  const rotate = useRef(onRotate);
  rotate.current = onRotate;
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.altKey || e.ctrlKey || e.metaKey) return;
      const d = DIRS.find(x => x.key === e.code);
      if (d) { e.preventDefault(); nudge.current(d.dir); return; }  // 按住鍵盤時由系統的重複按鍵連續移動
      if (e.code === "KeyR" && !e.repeat) { e.preventDefault(); rotate.current(); }
    };
    addEventListener("keydown", onKey, { capture: true });
    return () => removeEventListener("keydown", onKey, { capture: true });
  }, []);
  const hold = (act: () => boolean) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.currentTarget.setPointerCapture(e.pointerId); start(act); },
    onPointerUp: stop, onPointerCancel: stop, onLostPointerCapture: stop, onBlur: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    // 鍵盤（Enter／空白鍵）點按鈕：只動一步
    onClick: (e: React.MouseEvent) => { if (e.detail === 0) act(); },
  });
  return (
    <div className={m.move} role="group" aria-label={`移動${name}`}>
      <span className={m.moveName}>移動{name}</span>
      <div className={m.movePad}>
        {DIRS.map(d => (
          <button key={d.dir} type="button" className={m.moveKey} data-dir={d.dir} aria-label={`${name}${d.word}移`} title={`${name}${d.word}移`}
            {...hold(() => nudge.current(d.dir))}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ transform: `rotate(${d.turn}deg)` }}>
              <path d="M12 4l6 7h-4v9h-4v-9H6z" fill="currentColor" />
            </svg>
          </button>
        ))}
        <button type="button" className={m.moveKey} data-dir="rot" aria-label={`${name}轉 90 度`} title={`${name}轉 90 度`} {...hold(() => rotate.current())}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M12 5a7 7 0 1 1-6.6 4.7l2.8 1A4 4 0 1 0 12 8v3L7 6.5 12 2z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
