// 虛擬飼養的聲音（第 6 份，#354）：背景音樂依場景切換、音效給第 1～5 份呼叫、靜音記住玩家的選擇。
// 音檔放 public/play/audio/<ID>.mp3，每個都要有同名的 .license.txt。ID 照 docs/play-tasks/00-總表.md「聲音」。
// 這個檔案只放純函式與名稱清單（有測試）；真的播放在 audio-player.ts。
import type { NodeId } from "./story";

export const BGM_IDS = ["bgm_arrive", "bgm_daily", "bgm_night", "bgm_vet", "bgm_farewell"] as const;
export type BgmId = (typeof BGM_IDS)[number];

/** 音效名稱清單：第 1～5 份在對的時機呼叫 playSfx(<ID>) */
export const SFX_IDS = [
  // 貓的聲音
  "sfx_meow", "sfx_meow_cute", "sfx_purr", "sfx_hiss", "sfx_scream", "sfx_yowl",
  // 貓的動作
  "sfx_step", "sfx_dash", "sfx_land", "sfx_eat", "sfx_drink", "sfx_dig", "sfx_scratch", "sfx_spray",
  // 照顧動作
  "sfx_pour_food", "sfx_can_open", "sfx_pour_water", "sfx_scoop", "sfx_bag", "sfx_clip", "sfx_brush", "sfx_carrier_door",
  // 逗貓
  "sfx_toy", "sfx_pounce",
  // 介面
  "sfx_tap", "sfx_trust_up", "sfx_stress_up", "sfx_done", "sfx_fail", "sfx_accident",
] as const;
export type SfxId = (typeof SFX_IDS)[number];

/** 已經放進 public/play/audio/ 的音效。還沒有檔案的音效呼叫了也不會出聲、不會報錯；補了檔案就加進來。 */
export const SFX_READY: ReadonlySet<SfxId> = new Set<SfxId>([]);

/** 要循環的背景音樂（升天只播一次） */
export const bgmLoops = (id: BgmId) => id !== "bgm_farewell";

export const audioSrc = (id: BgmId | SfxId) => `/play/audio/${id}.mp3`;

export interface BgmInput {
  /** 流程的步驟（flow.ts 的 step） */
  step: string;
  nodeId: NodeId | null;
  /** 劇本的場景（flow.ts 的 scene） */
  scene: { bg: string; time: string };
  /** 在家的時光 */
  home: boolean;
}

/**
 * 現在該播哪首背景音樂（總表「目前遊戲的節點」那張表）：
 * 開場、採買、擺用品、試養報告、在家的時光＝日常；診間＝醫院；結尾＝升天；
 * 第 1 天＝剛到家（硬拉那晚是半夜）；其他節點的夜晚＝半夜，白天、傍晚＝日常。
 */
export function bgmFor({ step, nodeId, scene, home }: BgmInput): BgmId {
  if (step !== "node" || home) return "bgm_daily";
  if (nodeId === "farewell") return "bgm_farewell";
  if (scene.bg === "vet") return "bgm_vet";
  if (scene.time === "night") return "bgm_night";
  if (nodeId === "day1") return "bgm_arrive";
  return "bgm_daily";
}

export const MUTE_KEY = "meowho.play.muted";

/** 讀玩家上次的靜音選擇；讀不到（無痕模式、被擋）就當沒靜音 */
export function readMuted(store: Pick<Storage, "getItem"> | null | undefined): boolean {
  try { return store?.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

export function writeMuted(store: Pick<Storage, "setItem"> | null | undefined, muted: boolean): void {
  try { store?.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* 存不了就只在這次有效 */ }
}

/** 淡入淡出：第 t 毫秒的音量（0～1），duration 0 直接到終點 */
export function fadeVolume(from: number, to: number, t: number, duration: number): number {
  if (duration <= 0 || t >= duration) return to;
  if (t <= 0) return from;
  return from + (to - from) * (t / duration);
}
