import type { CareAct } from "@/lib/play/care";

export type CareIconId = CareAct | "heart" | "hiss";

// #456（渝茜 11/17）：在家的時光的圖示改用 emoji（原本是自繪線條圖示）：餵貓放碗、換水放水滴、鏟屎放大便、摸貓放手、刷牙放牙刷。
// 圖示列、貓頭頂的需求氣泡、劇情情緒氣泡都走這裡，同一套。
export const CARE_EMOJI: Record<CareIconId, string> = {
  feed: "🥣",
  water: "💧",
  scoop: "💩",
  play: "🐭",
  pet: "✋",
  brush: "🪥",
  nail: "🐾",
  heart: "💕",
  hiss: "💢",
};

export function CareIcon({ id }: { id: CareIconId }) {
  return <span aria-hidden="true" style={{ display: "inline-block", fontSize: 24, lineHeight: 1, fontStyle: "normal" }}>{CARE_EMOJI[id]}</span>;
}
