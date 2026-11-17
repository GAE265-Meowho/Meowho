import type { CareAct } from "@/lib/play/care";

export type CareIconId = CareAct | "heart" | "hiss";

// #456（渝茜 11/17）：在家的時光的圖示改用 emoji（原本是自繪線條圖示）：餵貓放碗、換水放水滴、鏟屎放大便、摸貓放手、刷牙放牙刷。
// 圖示列、貓頭頂的需求氣泡、劇情情緒氣泡都走這裡，同一套。
export const CARE_EMOJI: Record<CareIconId, string> = {
  feed: "🥣",
  water: "💧",
  scoop: "💩",
  play: "🧶",
  pet: "✋",
  brush: "🪥",
  nail: "🐾",  // 實際畫面用上面自畫的貓掌（NailIcon）；這個只是備用文字
  heart: "💕",
  hiss: "💢",
};

// 剪指甲：貓咪的手掌，指甲又尖又長（emoji 沒有合適的，自己畫；掌心膚色、指甲白色、深咖啡色描邊）
function NailIcon() {
  return (
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" stroke="#7a4a26" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round">
      <path d="M4.4 11.6 2.2 5.4 6.8 8.6Z" fill="#fff" />
      <path d="M8.4 8 7.6 1.4 11.2 6.8Z" fill="#fff" />
      <path d="M15.6 8 16.4 1.4 12.8 6.8Z" fill="#fff" />
      <path d="M19.6 11.6 21.8 5.4 17.2 8.6Z" fill="#fff" />
      <ellipse cx="5.4" cy="13" rx="2.1" ry="2.5" fill="#f6c9a0" />
      <ellipse cx="9.4" cy="10.2" rx="2.2" ry="2.7" fill="#f6c9a0" />
      <ellipse cx="14.6" cy="10.2" rx="2.2" ry="2.7" fill="#f6c9a0" />
      <ellipse cx="18.6" cy="13" rx="2.1" ry="2.5" fill="#f6c9a0" />
      <path d="M12 13c-3 0-6 2.8-6 5.6 0 2 1.7 3.1 3.4 3.1 1 0 1.6-.4 2.6-.4s1.6.4 2.6.4c1.7 0 3.4-1.1 3.4-3.1 0-2.8-3-5.6-6-5.6Z" fill="#f6c9a0" />
    </svg>
  );
}

export function CareIcon({ id }: { id: CareIconId }) {
  if (id === "nail") return <NailIcon />;
  return <span aria-hidden="true" style={{ display: "inline-block", fontSize: 24, lineHeight: 1, fontStyle: "normal" }}>{CARE_EMOJI[id]}</span>;
}
