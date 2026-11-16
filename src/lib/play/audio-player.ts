// 虛擬飼養的播放器（第 6 份，#393）：整個遊戲共用一個，只在瀏覽器執行。
// 手機瀏覽器規定使用者點過畫面才能出聲：還沒點過時只記下要播哪首，第一次點擊（unlockAudio）再開始播。
// 第 1～5 份要出聲時呼叫 playSfx(<ID>)；還沒有音檔的音效呼叫了也不會出聲、不會報錯。
// 有哪些音檔：第一次用到時讀 /api/play/sounds（Storage 實際的檔案），讀不到就照 SOUNDS 的 ready。
import { audioSrc, bgmLoops, fadeVolume, hasSound, playableBgm, readMuted, writeMuted, type BgmId, type SfxId, type SoundId, type SoundIndex } from "./audio";

// 2026-11-14 渝茜：背景音樂調降 40%（原 0.45）
const BGM_VOLUME = 0.27;
const SFX_VOLUME = 0.8;
const FADE_MS = 900;

let muted: boolean | null = null;
let unlocked = false;
let wanted: BgmId | null = null;
/** 背景音樂的音量比例（0～1）：結局的暗幕、漸白時淡出（setBgmLevel） */
let level = 1;
let current: { id: BgmId; el: HTMLAudioElement } | null = null;
const listeners = new Set<() => void>();
let index: SoundIndex | null = null;
let indexLoading: Promise<void> | null = null;

/** 讀 Storage 裡有哪些音檔（只讀一次）；讀到後如果背景音樂已經在等，就開始播 */
export function loadSoundIndex(): Promise<void> {
  if (indexLoading) return indexLoading;
  if (typeof fetch === "undefined") return Promise.resolve();
  indexLoading = fetch("/api/play/sounds")
    .then(r => (r.ok ? r.json() : null))
    .then((d: { files?: SoundIndex | null } | null) => { if (d?.files) { index = d.files; startWanted(); } })
    .catch(() => {});
  return indexLoading;
}

const src = (id: SoundId) => audioSrc(id, undefined, index?.[id]);

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

/** 每個 audio 目前的淡入淡出：新的蓋掉舊的，不會兩個同時拉音量 */
const fading = new WeakMap<HTMLAudioElement, number>();

/** 音量從現在的值慢慢變到 to（花 ms 毫秒），做完呼叫 done */
function fade(el: HTMLAudioElement, to: number, done?: () => void, ms = FADE_MS) {
  const from = el.volume;
  const start = performance.now();
  const token = (fading.get(el) ?? 0) + 1;
  fading.set(el, token);
  const tick = (now: number) => {
    if (fading.get(el) !== token) return;
    el.volume = Math.min(1, Math.max(0, fadeVolume(from, to, now - start, ms)));
    if (now - start < ms) requestAnimationFrame(tick);
    else done?.();
  };
  requestAnimationFrame(tick);
}

function fadeOutAndStop(el: HTMLAudioElement) {
  fade(el, 0, () => { el.pause(); el.removeAttribute("src"); el.load(); });
}

function startWanted() {
  if (!unlocked || isMuted() || !wanted || typeof Audio === "undefined") return;
  // 還沒有音檔的（例如結案報告）改播備用的那首；和現在播的一樣就接著播
  const id = playableBgm(wanted, index);
  if (current?.id === id) {
    if (current.el.paused) { current.el.play().then(() => fade(current!.el, BGM_VOLUME * level)).catch(() => {}); }
    return;
  }
  if (current) fadeOutAndStop(current.el);
  const url = hasSound(id, index) ? src(id) : "";
  if (!url) { current = null; return; }
  const el = new Audio(url);
  el.loop = bgmLoops(id);
  el.volume = 0;
  el.preload = "auto";
  current = { id, el };
  el.play().then(() => fade(el, BGM_VOLUME * level)).catch(() => {});
}

/** 背景音樂的音量比例（0～1），花 ms 毫秒慢慢變過去（結局的暗幕、漸白） */
export function setBgmLevel(next: number, ms = FADE_MS) {
  level = Math.min(1, Math.max(0, next));
  if (current && !current.el.paused && !isMuted()) fade(current.el, BGM_VOLUME * level, undefined, ms);
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
  if (!unlocked || isMuted() || typeof Audio === "undefined") return;
  const url = hasSound(id, index) ? src(id) : "";
  if (!url) return;
  const el = new Audio(url);
  el.volume = volume;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    unsubscribe();
    el.removeEventListener("ended", stop);
    el.removeEventListener("error", stop);
    el.pause();
    el.removeAttribute("src");
    el.load();
  };
  const unsubscribe = subscribeMuted(() => { if (isMuted()) stop(); });
  el.addEventListener("ended", stop);
  el.addEventListener("error", stop);
  el.play().catch(stop);
  return stop;
}
