// 虛擬飼養：貓頭頂的小對話框（SVG 圖示）。在家的時光裡，這一輪還沒做的照顧動作就是貓現在的需求，
// 依優先順序一次只顯示一個：做完一個，下一個需求冒出來；都做完就不顯示。劇情裡的情緒（BUB）也走這裡。純函式。
import type { CareAct } from "./care";

/** 需求的優先順序：餵貓＝食物、換水＝水、鏟屎＝便便（貓砂盆沒清），其餘是想玩、想被摸、牙齒、指甲 */
export const NEEDS: readonly { act: CareAct; label: string }[] = [
  { act: "feed", label: "肚子餓了" },
  { act: "water", label: "想喝水" },
  { act: "scoop", label: "貓砂盆還沒清" },
  { act: "play", label: "想玩" },
  { act: "pet", label: "想被摸" },
  { act: "brush", label: "牙齒要刷" },
  { act: "nail", label: "指甲太長" },
];

/** 劇情裡的情緒：愛心、嘶聲 */

/** 這一輪在家的時光，貓現在最想要什麼（還沒做的第一個動作）。canPlay＝有沒有 3D 逗貓可以玩 */
export function homeNeed(done: readonly CareAct[], canPlay: boolean): (typeof NEEDS)[number] | null {
  const n = NEEDS.find(x => !done.includes(x.act) && (canPlay || x.act !== "play"));
  return n ?? null;
}

/** 貓頭頂要顯示的符號：劇情的情緒（BUB）優先，在家的時光才顯示需求，其他時候不顯示 */
export function catBubble(input: { storyBub: string | null; home: boolean; busy: boolean; done: readonly CareAct[]; canPlay: boolean }): CareAct | "heart" | "hiss" | null {
  if (input.storyBub === "heart" || input.storyBub === "hiss") return input.storyBub;
  if (!input.home || input.busy) return null;
  return homeNeed(input.done, input.canPlay)?.act ?? null;
}
