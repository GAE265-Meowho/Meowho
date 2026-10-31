// 通用「結構化輸出」鏈：訊息組裝 → 模型（withStructuredOutput）→ zod 驗證。
// 模型以參數注入：正式環境用 getChatModel()，測試用假的 Runnable，不必連網。
import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { RunnableLambda, type Runnable } from "@langchain/core/runnables";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { z } from "zod";

import { withGuard } from "./guard";

/** text：送給模型的文字；使用者打的內容必須先用 guard.ts 的 wrapUserInput 包好（見 onboarding.ts） */
export interface ChainInput {
  text: string;
  imageDataUrl?: string;
  /** 影片等多媒體（目前只有 Gemini 支援，以 inlineData 送出） */
  media?: { mimeType: string; data: string };
}

/** 組成送給模型的訊息；系統指示一律附上防護規則；有圖片時以 image_url 內容片段附上（各供應商通用格式） */
export function buildMessages(system: string, input: ChainInput): BaseMessage[] {
  const human = input.imageDataUrl
    ? new HumanMessage({ content: [{ type: "text", text: input.text }, { type: "image_url", image_url: { url: input.imageDataUrl } }] })
    : input.media
      ? new HumanMessage({ content: [{ type: "text", text: input.text }, { type: "media", mimeType: input.media.mimeType, data: input.media.data }] })
      : new HumanMessage(input.text);
  return [new SystemMessage(withGuard(system)), human];
}

/** 把聊天模型包成「輸出符合 schema」的 Runnable */
export function structured<S extends z.ZodTypeAny>(model: BaseChatModel, schema: S, name: string): Runnable<BaseMessage[], unknown> {
  return model.withStructuredOutput(schema, { name }) as Runnable<BaseMessage[], unknown>;
}

export function createStructuredChain<S extends z.ZodTypeAny>(system: string, schema: S, runner: Runnable<BaseMessage[], unknown>) {
  return RunnableLambda.from((input: ChainInput) => buildMessages(system, input))
    .pipe(runner)
    .pipe(RunnableLambda.from((out: unknown) => schema.parse(out) as z.infer<S>));
}
