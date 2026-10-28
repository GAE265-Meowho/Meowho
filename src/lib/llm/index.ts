import "server-only";
// LLM 統一介面：以環境變數切換供應商（LLM_PROVIDER=gemini|openai）。
// 沒有設定金鑰時 isLLMConfigured() 為 false，呼叫端改用規則式解析。

export type LLMImage = { mime: string; base64: string };
export interface LLMJsonRequest {
  system: string;
  user: string;
  image?: LLMImage;
  /** 給模型看的 JSON 格式說明（純文字描述即可） */
  jsonShape: string;
  temperature?: number;
}

const provider = () => (process.env.LLM_PROVIDER ?? (process.env.GEMINI_API_KEY ? "gemini" : process.env.OPENAI_API_KEY ? "openai" : "")).toLowerCase();

export function isLLMConfigured(): boolean {
  const p = provider();
  return (p === "gemini" && !!process.env.GEMINI_API_KEY) || (p === "openai" && !!process.env.OPENAI_API_KEY);
}

export function llmLabel(): string {
  const p = provider();
  return p === "gemini" ? `Gemini (${process.env.LLM_MODEL ?? "gemini-2.5-flash"})` : p === "openai" ? `OpenAI (${process.env.LLM_MODEL ?? "gpt-4o-mini"})` : "規則式解析";
}

/** 呼叫 LLM 並回傳解析後的 JSON；失敗時重試一次，仍失敗則丟出錯誤 */
export async function llmJson<T>(req: LLMJsonRequest): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = provider() === "openai" ? await callOpenAI(req) : await callGemini(req);
      return JSON.parse(stripFence(text)) as T;
    } catch (e) { last = e; }
  }
  throw last instanceof Error ? last : new Error("LLM 呼叫失敗");
}

const stripFence = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();

const instructions = (req: LLMJsonRequest) =>
  `${req.system}\n\n只輸出 JSON，不要任何其他文字。格式：\n${req.jsonShape}`;

async function callGemini(req: LLMJsonRequest): Promise<string> {
  const model = process.env.LLM_MODEL ?? "gemini-2.5-flash";
  const parts: unknown[] = [{ text: req.user }];
  if (req.image) parts.push({ inline_data: { mime_type: req.image.mime, data: req.image.base64 } });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions(req) }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: req.temperature ?? 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
}

async function callOpenAI(req: LLMJsonRequest): Promise<string> {
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const content: unknown[] = [{ type: "text", text: req.user }];
  if (req.image) content.push({ type: "image_url", image_url: { url: `data:${req.image.mime};base64,${req.image.base64}` } });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model, temperature: req.temperature ?? 0.2, response_format: { type: "json_object" },
      messages: [{ role: "system", content: instructions(req) }, { role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}
