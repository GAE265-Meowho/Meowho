import "server-only";
// 模型工廠：所有 LLM 都從這裡取得，換供應商只改環境變數，不改業務程式。
// 各供應商套件用動態 import，只載入實際用到的那一家。
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Embeddings } from "@langchain/core/embeddings";
import { describe, isAzureV1, isConfigured, resolveEmbedding, resolveModel, resolveProvider, withProvider, type Provider, type Task } from "./config";

/** provider：指定這次固定用哪家（不指定＝全站 AI_PROVIDER） */
export const isAIConfigured = (provider?: Provider) => isConfigured(withProvider(process.env, provider));
export const aiLabel = () => describe(process.env);

export async function getChatModel(task: Task, opts: { temperature?: number; provider?: Provider } = {}): Promise<BaseChatModel> {
  const env = withProvider(process.env, opts.provider);
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
      if (isAzureV1(env.AZURE_OPENAI_ENDPOINT)) {
        // v1 端點是 OpenAI 相容 API：用 ChatOpenAI 指向這個網址，部署名稱當 model
        const { ChatOpenAI } = await import("@langchain/openai");
        // 不帶 temperature：較新的部署（例如 gpt-6-luna）可能只接受預設值；cat_studio demo 不帶 temperature 實測可用
        return new ChatOpenAI({
          model, apiKey: env.AZURE_OPENAI_API_KEY, maxRetries,
          configuration: { baseURL: env.AZURE_OPENAI_ENDPOINT!.trim().replace(/\/+$/, ""), defaultHeaders: { "api-key": env.AZURE_OPENAI_API_KEY ?? "" } },
        });
      }
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

/** Embedding 模型（幫我找貓，規格 11）；沒有可用的模型回傳 null，呼叫端改用備案排序。key 和向量一起存，換模型就重算 */
export async function getEmbeddings(): Promise<{ model: Embeddings; key: string } | null> {
  const env = process.env;
  const e = resolveEmbedding(env);
  if (!e) return null;
  const maxRetries = 1;
  switch (e.provider) {
    case "openai": {
      const { OpenAIEmbeddings } = await import("@langchain/openai");
      return { key: e.key, model: new OpenAIEmbeddings({ model: e.model, apiKey: env.OPENAI_API_KEY, dimensions: e.dims ?? undefined, maxRetries }) };
    }
    case "azure": {
      // Embedding 部署在另一個 Azure 資源（例如 Foundry 專案）時，用 AZURE_OPENAI_EMBEDDING_ENDPOINT／_API_KEY；沒設就沿用聊天模型的
      const endpoint = (env.AZURE_OPENAI_EMBEDDING_ENDPOINT || env.AZURE_OPENAI_ENDPOINT || "").trim();
      const apiKey = env.AZURE_OPENAI_EMBEDDING_API_KEY || env.AZURE_OPENAI_API_KEY;
      if (isAzureV1(endpoint)) {
        // v1 端點是 OpenAI 相容 API：部署名稱當 model
        const { OpenAIEmbeddings } = await import("@langchain/openai");
        return { key: e.key, model: new OpenAIEmbeddings({
          model: e.model, apiKey, dimensions: e.dims ?? undefined, maxRetries,
          configuration: { baseURL: endpoint.replace(/\/+$/, ""), defaultHeaders: { "api-key": apiKey ?? "" } },
        }) };
      }
      const { AzureOpenAIEmbeddings } = await import("@langchain/openai");
      return { key: e.key, model: new AzureOpenAIEmbeddings({
        azureOpenAIApiKey: apiKey, azureOpenAIEndpoint: endpoint,
        azureOpenAIApiDeploymentName: e.model, azureOpenAIApiVersion: env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
        dimensions: e.dims ?? undefined, maxRetries,
      }) };
    }
    case "gemini": {
      const { GoogleGenerativeAIEmbeddings } = await import("@langchain/google-genai");
      return { key: e.key, model: new GoogleGenerativeAIEmbeddings({ model: e.model, apiKey: env.GEMINI_API_KEY, maxRetries }) };
    }
    default:
      return null;
  }
}
