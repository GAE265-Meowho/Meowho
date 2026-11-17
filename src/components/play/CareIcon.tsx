import type { CareAct } from "@/lib/play/care";

export type CareIconId = CareAct | "heart" | "hiss";

// #456（渝茜 11/17）：在家的時光的圖示改用 emoji（原本是自繪線條圖示）：餵貓放魚、換水放水滴、鏟屎放大便、摸貓放手、刷牙放牙刷。
// 圖示列、貓頭頂的需求氣泡、劇情情緒氣泡都走這裡，同一套。
export const CARE_EMOJI: Record<CareIconId, string> = {
  feed: "🐟",
  water: "💧",
  scoop: "💩",
  play: "🧶",
  pet: "✋",
  brush: "🪥",
  nail: "✂️",
  heart: "💕",
  hiss: "💢",
};

// 餵貓：碗上放著飼料——🥣 碗在下面，🐟 縮小疊在碗口上方（emoji 沒有「碗裡有飼料」這一個，用兩個疊起來）
function FeedIcon() {
  return (
    <span aria-hidden="true" style={{ position: "relative", display: "inline-block", width: 28, height: 24, lineHeight: 1, fontStyle: "normal" }}>
      <span style={{ position: "absolute", left: 1, bottom: -3, fontSize: 24 }}>🥣</span>
      <span style={{ position: "absolute", left: 7, top: -5, fontSize: 15 }}>🐟</span>
    </span>
  );
}

export function CareIcon({ id }: { id: CareIconId }) {
  if (id === "feed") return <FeedIcon />;
  return <span aria-hidden="true" style={{ display: "inline-block", fontSize: 24, lineHeight: 1, fontStyle: "normal" }}>{CARE_EMOJI[id]}</span>;
}
