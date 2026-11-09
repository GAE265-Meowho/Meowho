// 幫我找貓（規格 docs/spec/11）：一句話拆成條件、為前幾名寫推薦理由。
// 提示詞在 src/lib/prompts/find.ts；使用者的話、喵戶資料、貓的資料都是資料，一律經 wrapUserInput 包成資料區。
import type { BaseMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import { TW_CITIES } from "@/lib/geo/tw-districts";
import { emptyConditions, type FindCatRow, type FindConditions } from "@/lib/find-cats";
import { FIND_PARSE, FIND_REASONS } from "@/lib/prompts/find";
import { createStructuredChain } from "./chain";
import { wrapUserInput } from "./guard";
import { FindParseSchema, FindReasonsSchema } from "./schemas";
import type { z } from "zod";

type Runner = Runnable<BaseMessage[], unknown>;

export const findParseChain = (runner: Runner) => createStructuredChain(FIND_PARSE.system, FindParseSchema, runner);
export const findParseInput = (q: string) => ({ text: `請整理這句話的找貓條件。\n${wrapUserInput(q.slice(0, 200))}` });

/** AI 的結果 → 條件：縣市不在台灣縣市清單裡就當沒說 */
export function toConditions(p: z.infer<typeof FindParseSchema>): FindConditions {
  return { ...emptyConditions(), ...p, city: p.city && TW_CITIES.includes(p.city) ? p.city : null, wish: p.wish.trim() };
}

export const findReasonsChain = (runner: Runner) => createStructuredChain(FIND_REASONS.system, FindReasonsSchema, runner);

/** 送給 AI 的：這個人的需求，和每隻貓的 id 與介紹文字（catText）。最多 6 隻 */
export const findReasonsInput = (need: string, cats: { row: FindCatRow; text: string }[]) => ({
  text: `請為下面每隻貓各寫一句為什麼推薦。\n${wrapUserInput([
    `這個人的需求：\n${need.slice(0, 400)}`,
    ...cats.slice(0, 6).map(c => `貓（id：${c.row.id}）\n${c.text.slice(0, 700)}`),
  ].join("\n\n"))}`,
});
