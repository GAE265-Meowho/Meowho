// AI 供應商與模型設定（純函式，不含金鑰以外的副作用，方便測試）
// 換模型只改環境變數：AI_PROVIDER、AI_MODEL、AI_MODEL_VISION

export type Provider = "gemini" | "openai" | "azure" | "anthropic";
export type Task = "text" | "vision";

export const DEFAULT_MODELS: Record<Provider, Record<Task, string>> = {
  gemini: { text: "gemini-2.5-flash", vision: "gemini-2.5-flash" },
  openai: { text: "gpt-4o-mini", vision: "gpt-4o-mini" },
  azure: { text: "", vision: "" },            // Azure 以部署名稱為準（AZURE_OPENAI_DEPLOYMENT）
  anthropic: { text: "claude-haiku-4-5", vision: "claude-haiku-4-5" },
};

const KEY_ENV: Record<Provider, string[]> = {
  gemini: ["GEMINI_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  azure: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_DEPLOYMENT"],
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

/** 供應商需要的環境變數都齊全才算可用 */
export function isConfigured(env: Env): boolean {
  const p = resolveProvider(env);
  return Boolean(p && KEY_ENV[p].every(k => env[k]));
}

/** 依任務取模型名稱：AI_MODEL_VISION ＞ AI_MODEL（相容 LLM_MODEL）＞ 預設 */
export function resolveModel(env: Env, provider: Provider, task: Task): string {
  if (provider === "azure") return env.AZURE_OPENAI_DEPLOYMENT ?? "";
  const general = env.AI_MODEL ?? env.LLM_MODEL;
  return (task === "vision" ? env.AI_MODEL_VISION ?? general : general) ?? DEFAULT_MODELS[provider][task];
}

export function describe(env: Env): string {
  const p = resolveProvider(env);
  if (!p || !isConfigured(env)) return "規則式解析（未設定 AI 金鑰）";
  return `${p}：${resolveModel(env, p, "text")}`;
}
