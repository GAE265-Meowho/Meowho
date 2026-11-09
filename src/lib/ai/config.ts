// AI 供應商與模型設定（純函式，不含金鑰以外的副作用，方便測試）
// 換模型只改環境變數：AI_PROVIDER、AI_MODEL、AI_MODEL_VISION

export type Provider = "gemini" | "openai" | "azure" | "anthropic";
export type Task = "text" | "vision";

export const DEFAULT_MODELS: Record<Provider, Record<Task, string>> = {
  // 2.5 系列已不開放給新申請的金鑰；3.8-flash 單次 12 秒以上，對話用不了，改用 flash-lite（約 2 秒，2026-10-31 實測）
  gemini: { text: "gemini-3.1-flash-lite", vision: "gemini-3.1-flash-lite" },
  openai: { text: "gpt-4o-mini", vision: "gpt-4o-mini" },
  azure: { text: "", vision: "" },            // Azure 以部署名稱為準（AZURE_OPENAI_CHAT_DEPLOYMENT_NAME，例如 gpt-6-luna）
  anthropic: { text: "claude-haiku-4-5", vision: "claude-haiku-4-5" },
};

const KEY_ENV: Record<Provider, string[]> = {
  gemini: ["GEMINI_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  azure: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],          // 部署名稱另外檢查（azureDeployment，兩個名稱擇一）
  anthropic: ["ANTHROPIC_API_KEY"],
};

type Env = Record<string, string | undefined>;

/** 決定供應商：AI_PROVIDER（相容舊的 LLM_PROVIDER）；沒指定時依有哪把金鑰自動判斷 */
export function resolveProvider(env: Env): Provider | null {
  const want = (env.AI_PROVIDER ?? env.LLM_PROVIDER ?? "").toLowerCase();
  if (want) return (["gemini", "openai", "azure", "anthropic"] as Provider[]).includes(want as Provider) ? (want as Provider) : null;
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.OPENAI_API_KEY) return "openai";
  if (env.AZURE_OPENAI_API_KEY) return "azure";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

/** Azure 聊天模型的部署名稱：AZURE_OPENAI_CHAT_DEPLOYMENT_NAME（cat_studio 也用這個名稱），相容舊的 AZURE_OPENAI_DEPLOYMENT */
export function azureDeployment(env: Env): string {
  return (env.AZURE_OPENAI_CHAT_DEPLOYMENT_NAME ?? env.AZURE_OPENAI_DEPLOYMENT ?? "").trim();
}

/** 指定某個模組固定用哪家（例如 MeowHQ 貓咪模型固定用 Azure），不受全站 AI_PROVIDER 影響 */
export function withProvider(env: Env, provider?: Provider): Env {
  return provider ? { ...env, AI_PROVIDER: provider } : env;
}

/** 供應商需要的環境變數都齊全才算可用 */
export function isConfigured(env: Env): boolean {
  const p = resolveProvider(env);
  if (!p || !KEY_ENV[p].every(k => env[k])) return false;
  return p !== "azure" || Boolean(azureDeployment(env));
}

/** 依任務取模型名稱：AI_MODEL_VISION ＞ AI_MODEL（相容 LLM_MODEL）＞ 預設 */
export function resolveModel(env: Env, provider: Provider, task: Task): string {
  if (provider === "azure") return azureDeployment(env);
  const general = env.AI_MODEL ?? env.LLM_MODEL;
  return (task === "vision" ? env.AI_MODEL_VISION ?? general : general) ?? DEFAULT_MODELS[provider][task];
}

/**
 * Azure 的新版 v1 端點（https://<資源>.openai.azure.com/openai/v1）：
 * 走 OpenAI 相容 API，部署名稱放在 model 欄位、不用 api-version；舊版端點（https://<資源>.openai.azure.com）走 deployments 路徑。
 */
export function isAzureV1(endpoint: string | undefined): boolean {
  return /\/openai\/v1\/?$/.test((endpoint ?? "").trim());
}

export function describe(env: Env): string {
  const p = resolveProvider(env);
  if (!p || !isConfigured(env)) return "規則式解析（未設定 AI 金鑰）";
  return `${p}：${resolveModel(env, p, "text")}`;
}

/** Embedding（幫我找貓的意思座標，規格 11）：OpenAI／Azure 固定縮成 1024 維，存進資料庫時和模型名稱一起記，換模型就重算 */
export const EMBEDDING_DIMS = 1024;
const DEFAULT_EMBEDDING: Partial<Record<Provider, string>> = { openai: "text-embedding-3-large", gemini: "gemini-embedding-001" };

/** 這次用哪個 Embedding 模型；Anthropic 沒有 Embedding、Azure 沒設部署名稱時回傳 null（改用備案排序） */
export function resolveEmbedding(env: Env): { provider: Provider; model: string; dims: number | null; key: string } | null {
  const provider = resolveProvider(env);
  if (!provider || !isConfigured(env)) return null;
  const model = provider === "azure" ? (env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT ?? "").trim() : (env.AI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING[provider] ?? "").trim();
  if (!model) return null;
  const dims = provider === "gemini" ? null : EMBEDDING_DIMS;
  return { provider, model, dims, key: `${provider}:${model}${dims ? `@${dims}` : ""}` };
}

/**
 * Foundry 的專案網址（https://<資源>.services.ai.azure.com/api/projects/<專案>）不能直接呼叫模型：
 * 換成同一個資源的 OpenAI 相容端點 https://<資源>.openai.azure.com/openai/v1。其他網址原樣回傳。
 */
export function azureModelEndpoint(endpoint: string | undefined): string {
  const raw = (endpoint ?? "").trim().replace(/\/+$/, "");
  try {
    const u = new URL(raw);
    if (u.hostname.endsWith(".services.ai.azure.com") && u.pathname.startsWith("/api/projects")) {
      return `https://${u.hostname.split(".")[0]}.openai.azure.com/openai/v1`;
    }
  } catch { /* 不是網址就原樣回傳，交給呼叫端報錯 */ }
  return raw;
}
