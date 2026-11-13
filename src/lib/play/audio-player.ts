// 虛擬飼養的播放器（第 6 份，#393）：整個遊戲共用一個，只在瀏覽器執行。
// 手機瀏覽器規定使用者點過畫面才能出聲：還沒點過時只記下要播哪首，第一次點擊（unlockAudio）再開始播。
// 第 1～5 份要出聲時呼叫 playSfx(<ID>)；還沒有音檔的音效（不在 SFX_READY）呼叫了也不會出聲、不會報錯。
import { audioSrc, bgmLoops, fadeVolume, readMuted, SFX_READY, writeMuted, type BgmId, type SfxId } from "./audio";

const BGM_VOLUME = 0.45;
const SFX_VOLUME = 0.8;
const FADE_MS = 900;

let muted: boolean | null = null;
let unlocked = false;
let wanted: BgmId | null = null;
let current: { id: BgmId; el: HTMLAudioElement } | null = null;
const listeners = new Set<() => void>();

const store = () => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };
const emit = () => listeners.forEach(l => l());

export function isMuted(): boolean {
  if (muted === null) muted = readMuted(store());
  return muted;
}

export function subscribeMuted(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** 音量從現在的值慢慢變到 to，做完呼叫 done */
function fade(el: HTMLAudioElement, to: number, done?: () => void) {
  const from = el.volume;
  const start = performance.now();
  const tick = (now: number) => {
    el.volume = Math.min(1, Math.max(0, fadeVolume(from, to, now - start, FADE_MS)));
    if (now - start < FADE_MS) requestAnimationFrame(tick);
    else done?.();
  };
  requestAnimationFrame(tick);
}

function fadeOutAndStop(el: HTMLAudioElement) {
  fade(el, 0, () => { el.pause(); el.removeAttribute("src"); el.load(); });
}

function startWanted() {
  if (!unlocked || isMuted() || !wanted || typeof Audio === "undefined") return;
  if (current?.id === wanted) {
    if (current.el.paused) { current.el.play().then(() => fade(current!.el, BGM_VOLUME)).catch(() => {}); }
    return;
  }
  if (current) fadeOutAndStop(current.el);
  const src = audioSrc(wanted);
  if (!src) { current = null; return; }
  const el = new Audio(src);
  el.loop = bgmLoops(wanted);
  el.volume = 0;
  el.preload = "auto";
  current = { id: wanted, el };
  el.play().then(() => fade(el, BGM_VOLUME)).catch(() => {});
}

/** 換背景音樂（同一首就不動）；null＝停掉 */
export function setBgm(id: BgmId | null) {
  wanted = id;
  if (!id) { if (current) fadeOutAndStop(current.el); current = null; return; }
  startWanted();
}

/** 使用者第一次點畫面：之後才可以出聲 */
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  startWanted();
}

export function setMuted(next: boolean) {
  muted = next;
  writeMuted(store(), next);
  if (next) { if (current) fade(current.el, 0, () => current?.el.pause()); }
  else startWanted();
  emit();
}

/** 第 1～5 份在對的時機呼叫，例如 playSfx("sfx_pour_water") */
export function playSfx(id: SfxId, volume = SFX_VOLUME) {
  if (!unlocked || isMuted() || !SFX_READY.has(id) || typeof Audio === "undefined") return;
  const src = audioSrc(id);
  if (!src) return;
  const el = new Audio(src);
  el.volume = volume;
  el.play().catch(() => {});
}
