// 貓咪動作庫（規格書 04 §2.6）：動作屬於母體 base_clips.glb，所有貓共用。
// 母體補入新動作時：在 cat_base/stepC_clips.py 新增 clip_xxx（吃喝拉撒、撒嬌、休息、理毛在 Meow/needs_clips.py，成貓幼貓共用；副本 scripts/blender/needs_clips.py），並把這裡對應動作的 status 改成 "ready"、CLIP_LIBRARY_VERSION +1。

export type ClipStatus = "ready" | "planned";

export interface ClipDef {
  code: string;
  label: string;
  status: ClipStatus;
}

export const CLIP_LIBRARY_VERSION = 10;
export const FALLBACK_CLIP = "idle";
/** 預覽預設瞳孔寬窄（細縫 0 → 全圓 1）；與 catEye EYE_DEFAULTS.pupil 相同 */
export const DEFAULT_PUPIL = 0.25;

export const CLIP_LIBRARY: readonly ClipDef[] = [
  { code: "idle", label: "待機", status: "ready" },
  { code: "walk", label: "走路", status: "ready" },
  { code: "sleep", label: "睡覺", status: "ready" },
  { code: "sit", label: "坐下", status: "ready" },
  { code: "eat", label: "吃飯", status: "ready" },
  { code: "drink", label: "喝水", status: "ready" },
  { code: "toilet", label: "上廁所", status: "ready" },
  { code: "cuddle", label: "撒嬌", status: "ready" },
  { code: "jump_a", label: "跳躍-(下往上跳) A", status: "ready" },
  { code: "jump_b", label: "跳躍-(往前跳) B", status: "ready" },
  { code: "jump_c", label: "跳躍-(從櫃子往下跳) C", status: "ready" },
  // #387 成貓改成蜷曲休息（8 秒）；幼貓仍是母雞蹲（4 秒）
  { code: "rest", label: "休息", status: "ready" },
  // #379 仰躺肚子朝上；目前只有成貓母體有，幼貓顯示「此體型尚無」
  { code: "belly_up", label: "休息（四腳朝天）", status: "ready" },
  { code: "groom", label: "理毛", status: "ready" },
  // #331 奔跑貓（cat_runner_tabby.glb）專用；成貓、幼貓、大貓母體目前沒有
  { code: "run", label: "奔跑", status: "ready" },
];

/** 特定體型＋動作的預設瞳孔（沒登記就用 DEFAULT_PUPIL）；切動作時預覽會套用，滑桿仍可手動改 */
const CLIP_PUPIL: Readonly<Record<string, Partial<Record<"adult" | "kitten", number>>>> = {
  sit: { kitten: 0.67 },
};

export function clipPupil(clip: string | null | undefined, body: "adult" | "kitten"): number {
  if (!clip) return DEFAULT_PUPIL;
  return CLIP_PUPIL[clip]?.[body] ?? DEFAULT_PUPIL;
}

export interface ClipItem extends ClipDef {
  /** 母體 glb 裡真的有這個動作，可以播放 */
  available: boolean;
}

/**
 * 動作清單：先放動作庫全部動作，再補上 glb 裡有、但動作庫沒登記的動作。
 * 能不能播以「母體 glb 裡真的有這個動作」為準：母體補入新動作後，清單自動可點，不必先改 status；
 * glb 裡沒有的（包含動作庫標示 ready 但母體還沒更新的）一律灰色不可點，避免報錯。
 */
export function buildClipItems(available: readonly string[]): ClipItem[] {
  const have = new Set(available);
  const items: ClipItem[] = CLIP_LIBRARY.map(c => ({ ...c, available: have.has(c.code) }));
  const known = new Set(CLIP_LIBRARY.map(c => c.code));
  for (const code of available) {
    if (!known.has(code)) items.push({ code, label: code, status: "ready", available: true });
  }
  return items;
}

/** 決定要播哪個動作：指定的動作可播就用它；找不到退回 idle；idle 也沒有就用第一個；都沒有回傳 null（不報錯） */
export function resolveClip(requested: string | null | undefined, available: readonly string[]): string | null {
  if (requested && available.includes(requested)) return requested;
  if (available.includes(FALLBACK_CLIP)) return FALLBACK_CLIP;
  return available[0] ?? null;
}
