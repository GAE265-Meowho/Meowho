// 貓咪動作庫（規格書 04 §2.6）：動作屬於母體 base_clips.glb，所有貓共用。
// 母體補入新動作時：在 cat_base/stepC_clips.py 新增 clip_xxx，並把這裡對應動作的 status 改成 "ready"、CLIP_LIBRARY_VERSION +1。

export type ClipStatus = "ready" | "planned";

export interface ClipDef {
  code: string;
  label: string;
  status: ClipStatus;
}

export const CLIP_LIBRARY_VERSION = 1;
export const FALLBACK_CLIP = "idle";

export const CLIP_LIBRARY: readonly ClipDef[] = [
  { code: "idle", label: "待機", status: "ready" },
  { code: "walk", label: "走路", status: "ready" },
  { code: "sleep", label: "睡覺", status: "ready" },
  { code: "eat", label: "吃飯", status: "planned" },
  { code: "toilet", label: "上廁所", status: "planned" },
  { code: "cuddle", label: "撒嬌", status: "planned" },
  { code: "jump", label: "跳躍", status: "planned" },
  { code: "rest", label: "休息", status: "planned" },
  { code: "groom", label: "理毛", status: "planned" },
];

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
