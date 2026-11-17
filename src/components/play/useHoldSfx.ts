// 「持續動作才有聲音」：音檔很長的音效（呼嚕）循環播，只在動作持續時響。
// poke()：動作這一刻有在做就呼叫（摸到貓喜歡的地方、手在動）；超過 idleMs 沒再呼叫、或呼叫 stop()、離開畫面就停。#456 渝茜
import { useCallback, useEffect, useRef } from "react";
import { playSfx } from "@/lib/play/audio-player";
import type { SfxId } from "@/lib/play/audio";

export function useHoldSfx(id: SfxId, volume: number, idleMs: number) {
  const s = useRef<{ stop: (() => void) | null; at: number }>({ stop: null, at: 0 });
  const stop = useCallback(() => { s.current.stop?.(); s.current.stop = null; }, []);
  const poke = useCallback(() => {
    s.current.at = Date.now();
    if (!s.current.stop) s.current.stop = playSfx(id, volume, { loop: true }) ?? null;
  }, [id, volume]);
  useEffect(() => {
    const timer = setInterval(() => { if (s.current.stop && Date.now() - s.current.at >= idleMs) stop(); }, 100);
    return () => { clearInterval(timer); stop(); };
  }, [idleMs, stop]);
  return { poke, stop };
}
