import "server-only";
// 模型工廠：所有 LLM 都從這裡取得，換供應商只改環境變數，不改業務程式。
// 各供應商套件用動態 import，只載入實際用到的那一家。
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { describe, isConfigured, resolveModel, resolveProvider, type Task } from "./config";

export const isAIConfigured = () => isConfigured(process.env);
export const aiLabel = () => describe(process.env);

export async function getChatModel(task: Task, opts: { temperature?: number } = {}): Promise<BaseChatModel> {
  const env = process.env;
  const provider = resolveProvider(env);
  if (!provider || !isConfigured(env)) throw new Error("AI 尚未設定");
  const model = resolveModel(env, provider, task);
  const temperature = opts.temperature ?? 0.2;
  const maxRetries = 1;

  switch (provider) {
    case "gemini": {
      const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");
      return new ChatGoogleGenerativeAI({ model, apiKey: env.GEMINI_API_KEY, temperature, maxRetries });
    }
    case "openai": {
      const { ChatOpenAI } = await import("@langchain/openai");
      return new ChatOpenAI({ model, apiKey: env.OPENAI_API_KEY, temperature, maxRetries });
    }
    case "azure": {
      const { AzureChatOpenAI } = await import("@langchain/openai");
      return new AzureChatOpenAI({
        azureOpenAIApiKey: env.AZURE_OPENAI_API_KEY,
        azureOpenAIEndpoint: env.AZURE_OPENAI_ENDPOINT,
        azureOpenAIApiDeploymentName: model,
        azureOpenAIApiVersion: env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
        temperature, maxRetries,
      });
    }
    case "anthropic": {
      const { ChatAnthropic } = await import("@langchain/anthropic");
      return new ChatAnthropic({ model, apiKey: env.ANTHROPIC_API_KEY, temperature, maxRetries });
    }
  }
}
