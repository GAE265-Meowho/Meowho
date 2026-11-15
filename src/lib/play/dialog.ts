// 虛擬飼養的劇情對話框（#354）：一次只顯示一句、說話的人用哪個頭像、節點進度的貓掌。純函式，畫面在 NodeStep。
import { SPEAKER_NAMES } from "./story";

export type AvatarId = "you" | "clerk" | "vet" | "partner" | "cat" | "dog" | "child" | "elder" | "person";
export interface Voice {
  /** 旁白：沒有頭像、沒有名牌 */
  narrator: boolean;
  name: string | null;
  avatar: AvatarId | null;
}

/** 按一次「繼續」：還有下一句就往下，最後一句再按才算這張卡看完（done） */
export function nextBeat(index: number, total: number): { index: number; done: boolean } {
  const last = Math.max(0, total - 1);
  if (index < last) return { index: index + 1, done: false };
  return { index: last, done: true };
}

const SCRIPT_AVATARS: Record<string, AvatarId> = { you: "you", clerk: "clerk", vet: "vet", partner: "partner" };

/** 這句是誰說的：劇本角色（you、clerk、vet、partner）、個人化台詞的人（你、貓名、同住的人、家裡的寵物）或旁白 */
export function voiceOf(who: string | undefined, catName: string): Voice {
  if (!who || who === "旁白") return { narrator: true, name: null, avatar: null };
  if (SCRIPT_AVATARS[who]) return { narrator: false, name: SPEAKER_NAMES[who] ?? who, avatar: SCRIPT_AVATARS[who] };
  const avatar: AvatarId = who === "你" ? "you"
    : who === catName || who.endsWith("的貓") ? "cat"
    : who.endsWith("的狗") ? "dog"
    : who.includes("小孩") ? "child"
    : who.includes("長輩") ? "elder"
    : "person";
  return { narrator: false, name: who, avatar };
}

export type PawState = "done" | "now" | "todo";
/** 節點進度：每個節點一個貓掌 */
export function pawSteps(nodeIndex: number, total: number): PawState[] {
  return Array.from({ length: total }, (_, i) => (i < nodeIndex ? "done" : i === nodeIndex ? "now" : "todo"));
}
export const progressLabel = (nodeIndex: number, total: number) => `節點 ${nodeIndex + 1}／${total}`;
