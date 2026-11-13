"use client";
// 虛擬飼養的背景音樂與靜音按鈕（第 6 份，#354）。播放規則在 lib/play/audio.ts，播放器在 lib/play/audio-player.ts。
import { useEffect, useSyncExternalStore } from "react";
import { bgmFor, type BgmInput } from "@/lib/play/audio";
import { isMuted, setBgm, setMuted, subscribeMuted, unlockAudio } from "@/lib/play/audio-player";
import s from "./play.module.css";

/** 依遊戲狀態切換背景音樂；離開遊戲時停掉。第一次點畫面後才會出聲（手機瀏覽器的規定）。 */
export function usePlayBgm(input: BgmInput) {
  const id = bgmFor(input);
  useEffect(() => { setBgm(id); }, [id]);
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      setBgm(null);
    };
  }, []);
}

const SpeakerIcon = ({ off }: { off: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
    <path d="M3.5 9.2h3.6L12 5v14l-4.9-4.2H3.5Z" fill="currentColor" />
    {off ? (
      <path d="m15.5 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    ) : (
      <path d="M15.4 9a4.2 4.2 0 0 1 0 6M17.9 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    )}
  </svg>
);

/** 畫面上方的音量／靜音按鈕，記住玩家的選擇 */
export function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  return (
    <button type="button" className={s.sound} aria-pressed={muted} aria-label={muted ? "開啟聲音" : "關閉聲音"}
      onClick={() => { unlockAudio(); setMuted(!muted); }}>
      <SpeakerIcon off={muted} />
    </button>
  );
}
