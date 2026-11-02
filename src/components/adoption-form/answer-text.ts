// 把回答轉成給人看的文字（中途看回覆、領養人送出前總覽共用）
import type { Answer, Question } from "@/lib/adoption-form/questionnaire";

// 申請進度改由領養管理的對話判斷（#128）；這裡只剩填寫人自己看的「草稿／已送出」。contact、follow_up 已由 0011 轉回 submitted。
export const RESPONSE_STATUS = { draft: "草稿", submitted: "已送出", contact: "已送出", follow_up: "已送出", declined: "未媒合" } as const;
export type ResponseStatus = keyof typeof RESPONSE_STATUS;

export function answerText(q: Question, a: Answer | undefined): string {
  if (a === undefined) return "（沒有回答）";
  if (typeof a === "string") return a.trim() || "（沒有回答）";
  if (Array.isArray(a)) return q.type === "photo" ? `${a.length} 張照片` : a.join("、") || "（沒有回答）";
  const yn = a.value === null ? "（沒有回答）" : a.value ? "是" : "否";
  return a.detail.trim() ? `${yn}，${a.detail.trim()}` : yn;
}
