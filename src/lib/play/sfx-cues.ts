// 音效接點（渝茜 2026-11-16：「到後台找音樂庫，有很多音效，幫我套上去」）。純函式。
// 後台 MeowHQ「虛擬體驗元件管理」→「音效」上傳的音檔（audio.ts 的 SOUNDS），在這裡決定「什麼事件播哪一個」；
// 元件只在事件發生的那一刻呼叫 playSfx(這裡回傳的 ID)。還沒上傳音檔的 ID 呼叫了也不出聲（audio-player.ts），之後補上傳就會自動響。
import { careOutcome, type CareAct } from "./care";
import type { SfxId } from "./audio";
import type { ScoopEvent } from "./mini3d/scoop-rules";
import type { CatPose } from "./story";

/** 按鈕聲的音量（其他音效 0.8）：每個按鈕都會響，要小聲一點 */
export const TAP_VOLUME = 0.35;

/** 「按住」的動作（倒飼料、開水龍頭）只在開始那一下響 */
export const rising = (prev: boolean, next: boolean) => !prev && next;

/**
 * 貓頭上的氣泡剛出現：哈氣、撒嬌喵；照顧需求（想吃、想喝…）是一般喵。
 * 半年後（month8）母貓那一幕的氣泡是發情大叫，不是哈氣。
 */
export function bubbleSfx(prev: string | null, next: string | null, at: { nodeId: string | null; female: boolean }): SfxId | null {
  if (!next || next === prev) return null;
  if (next === "hiss") return at.nodeId === "month8" && at.female ? "sfx_yowl" : "sfx_hiss";
  if (next === "heart") return "sfx_meow_cute";
  return "sfx_meow";
}

/** 貓的姿勢換了：第 30 天開始半夜跑酷是衝刺；進出外出籠是籠門開關（開場就在籠子裡不算） */
export function poseSfx(prev: CatPose | null, next: CatPose, nodeId: string | null): SfxId | null {
  if (prev === null || prev === next) return null;
  if (next === "zoom" && nodeId === "day30") return "sfx_dash";
  if (prev === "carrier" || next === "carrier") return "sfx_carrier_door";
  return null;
}

/** 信任、壓力上升（第一次讀到不算） */
export function meterSfx(prev: { trust: number; stress: number } | null, next: { trust: number; stress: number }): SfxId[] {
  if (!prev) return [];
  const out: SfxId[] = [];
  if (next.trust > prev.trust) out.push("sfx_trust_up");
  if (next.stress > prev.stress) out.push("sfx_stress_up");
  return out;
}

/** 做好之後貓的反應 */
const GOOD_AFTER: Partial<Record<CareAct, SfxId>> = { feed: "sfx_eat", water: "sfx_drink", pet: "sfx_purr", brush: "sfx_purr" };

/** 小遊戲做完：成功／失敗，再加上貓的反應（剪到血線尖叫、被咬是哈氣）。中途關掉或什麼都沒做不出聲 */
export function careSfx(act: CareAct, result: unknown): SfxId[] {
  const outcome = careOutcome(act, result);
  if (outcome === "none") return [];
  const r = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
  if (outcome === "good") return GOOD_AFTER[act] ? ["sfx_done", GOOD_AFTER[act]!] : ["sfx_done"];
  if (outcome === "partial") return [];
  if (r.bleed) return ["sfx_fail", "sfx_scream"];
  if (r.bitten || r.ran) return ["sfx_fail", "sfx_hiss"];
  return ["sfx_fail"];
}

/** 鏟屎：鏟起來是鏟砂聲，丟進袋子是垃圾袋聲 */
export const SCOOP_SFX: Partial<Record<Exclude<ScoopEvent, null>, SfxId>> = {
  pick: "sfx_scoop", pickPoop: "sfx_scoop", bagged: "sfx_bag", baggedSandy: "sfx_bag",
};

/** 逗貓：抓到的次數變多就是撲上去 */
export const catchSfx = (prev: number, next: number): SfxId | null => (next > prev ? "sfx_pounce" : null);
