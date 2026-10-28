// 通用「結構化輸出」鏈：訊息組裝 → 模型（withStructuredOutput）→ zod 驗證。
// 模型以參數注入：正式環境用 getChatModel()，測試用假的 Runnable，不必連網。
import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { RunnableLambda, type Runnable } from "@langchain/core/runnables";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { z } from "zod";

export interface ChainInput { text: string; imageDataUrl?: string }

/** 組成送給模型的訊息；有圖片時以 image_url 內容片段附上（各供應商通用格式） */
export function buildMessages(system: string, input: ChainInput): BaseMessage[] {
  const human = input.imageDataUrl
    ? new HumanMessage({ content: [{ type: "text", text: input.text }, { type: "image_url", image_url: { url: input.imageDataUrl } }] })
    : new HumanMessage(input.text);
  return [new SystemMessage(system), human];
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
