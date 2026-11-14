// 虛擬飼養：15 歲結局的鋪陳（#354，渝茜 2026-11-14）。純函式＋時間軸常數，畫面在 components/play/EndingOverlay.tsx。
//   前一天（3D 家裡，老貓躺著睡）→ 隔天（在睡夢中離去）→ 暗幕（慢慢全黑）→ 黑畫面裡升天音樂才進來
//   → 漸亮回顧遊戲中自動截下的幾張畫面 → 音樂漸弱、畫面漸白 → 結案報告（換回活潑的音樂）→ 認養貓咪彈窗。
// 回顧的截圖：玩的過程在幾個節點自動截（captureMoment），存記憶體＋瀏覽器 IndexedDB（review-store.ts），不進存檔 progress（50 KB 上限）。
import { STORY, type CatPose, type NodeId } from "./story";

/** 時間軸（毫秒）：全部集中在這裡調 */
export const ENDING_MS = {
  /** 暗幕：畫面慢慢全黑（原本的音樂同時淡出） */
  dark: 3200,
  /** 全黑：升天音樂這時才進來，停一下再亮 */
  hush: 2600,
  /** 每張回顧照停多久（含淡入） */
  slide: 2800,
  /** 回顧照淡入淡出 */
  fade: 1000,
  /** 漸白：音樂同時淡出 */
  white: 3000,
} as const;

export type EndingPhase = "dark" | "hush" | "review" | "white" | "done";

/** 結尾節點的台詞都演完、輪到飼養紀錄時，暗幕開始（飼養紀錄不顯示，直接接報告） */
export function endingStarts({ step, nodeId, curKind }: { step: string; nodeId: string | null; curKind: string | null | undefined }): boolean {
  return step === "node" && nodeId === "farewell" && curKind === "log";
}

/** 每個階段從第幾毫秒開始；回顧照至少一張（沒有截圖時用備用插圖） */
export function endingSchedule(slides: number): { phase: EndingPhase; at: number; slide?: number }[] {
  const n = Math.max(1, slides);
  const review0 = ENDING_MS.dark + ENDING_MS.hush;
  const white = review0 + n * ENDING_MS.slide;
  return [
    { phase: "dark", at: 0 },
    { phase: "hush", at: ENDING_MS.dark },
    ...Array.from({ length: n }, (_, i) => ({ phase: "review" as const, at: review0 + i * ENDING_MS.slide, slide: i })),
    { phase: "white", at: white },
    { phase: "done", at: white + ENDING_MS.white },
  ];
}

/** 背景音樂的音量（0～1）與淡入淡出時間：暗幕與漸白時淡出，其他全開 */
export function endingBgmLevel(phase: EndingPhase | null): { level: number; ms: number } {
  if (phase === "dark") return { level: 0, ms: ENDING_MS.dark };
  if (phase === "white" || phase === "done") return { level: 0, ms: ENDING_MS.white };
  return { level: 1, ms: 900 };
}

// ── 回顧的自動截圖 ──

/** 要截圖的節點：第 1 天、第 30 天、半年後、五年後、十年後（各一張） */
export const REVIEW_NODES: readonly NodeId[] = ["day1", "day30", "month8", "year5", "year10"];
/** 貓在畫面裡、看得到的姿勢（躲外出籠、床底、不在場的不截） */
const VISIBLE: readonly CatPose[] = ["sit", "sofa", "table", "zoom", "bed", "frail"];
/** 場景換了之後等多久再截（讓貓走到定位、鏡頭轉好） */
export const CAPTURE_DELAY_MS = 2600;

export interface ReviewShot { key: string; label: string; src: string }

/** 這一刻要不要截圖：回傳 key（節點），不截＝null。busy＝正在做在家的時光的小遊戲 */
export function captureMoment(a: { step: string; nodeId: string; bg: string; pose: CatPose; curKind: string | null | undefined; busy: boolean; taken: readonly string[] }): string | null {
  if (a.step !== "node" || a.busy || a.bg !== "room") return null;
  if (!REVIEW_NODES.includes(a.nodeId as NodeId) || a.taken.includes(a.nodeId)) return null;
  if (a.curKind !== "lines" && a.curKind !== "ask" && a.curKind !== "home") return null;
  return VISIBLE.includes(a.pose) ? a.nodeId : null;
}

const order = (key: string) => STORY.findIndex(n => n.id === key);

/** 加一張回顧照：同一個節點留先截到的，照劇情順序排；壞資料丟掉 */
export function mergeShots(list: readonly ReviewShot[], shot: ReviewShot): ReviewShot[] {
  const ok = (s: ReviewShot) => typeof s.src === "string" && s.src.length > 0 && order(s.key) >= 0;
  const out = list.filter(ok);
  if (ok(shot) && !out.some(s => s.key === shot.key)) out.push(shot);
  return out.sort((a, b) => order(a.key) - order(b.key));
}

/** 截圖縮成長邊 max（不放大） */
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

// ── 報告後的認養彈窗 ──

/** 報告頁出現後多久跳認養彈窗（活潑音樂開始之後） */
export const ADOPT_DELAY_MS = 1600;

/** 要不要跳「認養貓咪」彈窗：陪伴到最後、貓還開放認養、這一輪還沒跳過 */
export function shouldOfferAdopt(a: { adoptable: boolean; abandoned: boolean; seen: boolean }): boolean {
  return a.adoptable && !a.abandoned && !a.seen;
}

/** 這一輪跳過彈窗的紀錄（sessionStorage 的 key） */
export const adoptSeenKey = (runId: string | null, catId: string) => (runId ? `meowho.play.adopt.${runId}` : `meowho.play.adopt.demo.${catId}`);
