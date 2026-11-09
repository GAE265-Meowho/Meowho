// 貓咪頁的 3D 貓動作按鈕：沿用 MeowHQ 動作庫（lib/hq/cat-models/clips.ts），只列母體 glb 真的有、動作庫標 ready 的動作。
// 規劃中、這個體型還沒有、動作庫沒登記的動作都不列；後台用的名稱（例如「跳躍-(下往上跳) A」）在這裡換成給領養人看的說法。
// 母體補了新動作、動作庫改成 ready 之後，這裡不用改就會出現；想換顯示名稱再加進 PUBLIC_LABEL。
import { CLIP_LIBRARY, FALLBACK_CLIP } from "./hq/cat-models/clips";

const PUBLIC_LABEL: Record<string, string> = { jump_a: "跳上去", jump_b: "往前撲", jump_c: "從櫃子跳下來" };

export interface CatAction { code: string; label: string }

export function catActions(available: readonly string[]): CatAction[] {
  const have = new Set(available);
  return CLIP_LIBRARY.filter(c => c.status === "ready" && have.has(c.code)).map(c => ({ code: c.code, label: PUBLIC_LABEL[c.code] ?? c.label }));
}

/** 一開始播的動作：有待機就待機 */
export const firstAction = (available: readonly string[]) => (available.includes(FALLBACK_CLIP) ? FALLBACK_CLIP : available[0] ?? null);
