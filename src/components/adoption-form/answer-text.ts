// 把回答轉成給人看的文字（中途看回覆、領養人送出前總覽共用）
import type { Answer, Question } from "@/lib/adoption-form/questionnaire";

export const RESPONSE_STATUS = { draft: "草稿", submitted: "新收到", contact: "待聯絡", follow_up: "進一步了解", declined: "婉拒" } as const;
export type ResponseStatus = keyof typeof RESPONSE_STATUS;

export function answerText(q: Question, a: Answer | undefined): string {
  if (a === undefined) return "（沒有回答）";
  if (typeof a === "string") return a.trim() || "（沒有回答）";
  if (Array.isArray(a)) return q.type === "photo" ? `${a.length} 張照片` : a.join("、") || "（沒有回答）";
  const yn = a.value === null ? "（沒有回答）" : a.value ? "是" : "否";
  return a.detail.trim() ? `${yn}，${a.detail.trim()}` : yn;
}
