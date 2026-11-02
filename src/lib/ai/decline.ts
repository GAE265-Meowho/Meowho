// 婉拒理由草稿（#128）：中途按「婉拒」時先由 AI 擬一段，中途改過再送出。
// 提示詞在 src/lib/prompts/adoption.ts；問卷回答是申請人寫的內容，一律經 wrapUserInput 包成資料區。
import type { BaseMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import { z } from "zod";
import { DECLINE_DRAFT } from "@/lib/prompts/adoption";
import { createStructuredChain } from "./chain";
import { wrapUserInput } from "./guard";

type Runner = Runnable<BaseMessage[], unknown>;

/** 婉拒理由的字數上限（資料庫 0013 允許 500 字，草稿留空間給中途補充） */
export const DECLINE_DRAFT_CHARS = 150;

export const DeclineDraftSchema = z.object({
  reason: z.string().min(1).max(300).describe("給申請人看的婉拒說明，2～4 句，最多 150 字"),
});

export interface DeclineContext { catName: string; memberName: string; answers: { q: string; a: string }[] }

export const declineDraftChain = (runner: Runner) => createStructuredChain(DECLINE_DRAFT.system, DeclineDraftSchema, runner);

// 貓名、申請人名稱與問卷回答都來自使用者，一起包進資料區；問卷最多帶 30 題、每題 200 字
export const declineDraftInput = (c: DeclineContext) => ({
  text: `請幫中途擬婉拒說明。\n${wrapUserInput([
    `貓的名字：${c.catName}`,
    `申請人：${c.memberName}`,
    ...(c.answers.length ? ["申請人的問卷回答：", ...c.answers.slice(0, 30).map(x => `- ${x.q}：${x.a.slice(0, 200)}`)] : ["申請人還沒有填寫問卷，只有私訊。"]),
  ].join("\n"))}`,
});

/** AI 沒設定或失敗時的固定草稿 */
export const fallbackDeclineReason = (catName: string) =>
  `謝謝你願意給${catName}一個家。我們評估後，覺得目前的條件和${catName}的需要還不太適合，這次先不安排領養。也歡迎你認識其他正在等家的貓。`;

/** 收斂成可以直接放進輸入框的草稿：去頭尾空白、超過上限就截在句號 */
export function tidyDraft(reason: string, catName: string): string {
  const text = reason.trim();
  if (!text) return fallbackDeclineReason(catName);
  if (Array.from(text).length <= DECLINE_DRAFT_CHARS) return text;
  const cut = Array.from(text).slice(0, DECLINE_DRAFT_CHARS).join("");
  const end = cut.lastIndexOf("。");
  return end > 0 ? cut.slice(0, end + 1) : cut;
}
