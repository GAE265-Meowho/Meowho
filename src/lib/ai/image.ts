// AI 影像生成（#110）：以參考照片產生新照片（image edit）。業務程式只呼叫這裡，不直接用供應商 API。
// 目前只接 Azure OpenAI（部署 gpt-6-luna）；換供應商時在這裡加實作，用環境變數切換（同 models.ts 的做法）。
// 環境變數：AZURE_OPENAI_ENDPOINT、AZURE_OPENAI_API_KEY（與文字模型共用）、AZURE_OPENAI_IMAGE_DEPLOYMENT、AZURE_OPENAI_IMAGE_API_VERSION。

type Env = Record<string, string | undefined>;

export const DEFAULT_IMAGE_API_VERSION = "2025-04-01-preview";

export interface ImageConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}

/** 影像生成設定；缺任一項回 null（畫面顯示「尚未設定 AI 影像模型」） */
export function imageConfig(env: Env = process.env): ImageConfig | null {
  const endpoint = env.AZURE_OPENAI_ENDPOINT?.trim();
  const apiKey = env.AZURE_OPENAI_API_KEY?.trim();
  const deployment = env.AZURE_OPENAI_IMAGE_DEPLOYMENT?.trim();
  if (!endpoint || !apiKey || !deployment) return null;
  return { endpoint: endpoint.replace(/\/+$/, ""), apiKey, deployment, apiVersion: env.AZURE_OPENAI_IMAGE_API_VERSION?.trim() || DEFAULT_IMAGE_API_VERSION };
}

/** Azure OpenAI 影像編輯 API 的網址 */
export function imageEditUrl(cfg: ImageConfig): string {
  return `${cfg.endpoint}/openai/deployments/${encodeURIComponent(cfg.deployment)}/images/edits?api-version=${encodeURIComponent(cfg.apiVersion)}`;
}

export class ImageGenError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

/**
 * 以參考照片產生一張新照片，回傳 PNG。
 * 失敗時丟出 ImageGenError，訊息是白話（給畫面顯示），不含金鑰或原始回應全文。
 */
export async function editImage(
  cfg: ImageConfig,
  input: { image: Uint8Array; mime: string; prompt: string; size?: string },
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array> {
  const form = new FormData();
  const ext = input.mime === "image/png" ? "png" : input.mime === "image/webp" ? "webp" : "jpg";
  form.append("image", new Blob([new Uint8Array(input.image)], { type: input.mime }), `reference.${ext}`);
  form.append("prompt", input.prompt);
  form.append("size", input.size ?? "1024x1024");
  form.append("n", "1");
  let res: Response;
  try {
    res = await fetcher(imageEditUrl(cfg), { method: "POST", headers: { "api-key": cfg.apiKey }, body: form });
  } catch {
    throw new ImageGenError("連不到 AI 影像服務");
  }
  const json = (await res.json().catch(() => null)) as { data?: { b64_json?: string }[]; error?: { code?: string; message?: string } } | null;
  if (!res.ok) {
    const code = json?.error?.code ?? "";
    if (res.status === 429) throw new ImageGenError("AI 影像服務忙碌中，請稍後重新產生", res.status);
    if (code === "content_filter" || code === "moderation_blocked") throw new ImageGenError("照片被 AI 內容審核擋下，請換一張照片", res.status);
    if (res.status === 401 || res.status === 403) throw new ImageGenError("AI 影像服務的金鑰或權限有問題", res.status);
    if (res.status === 404) throw new ImageGenError("找不到 AI 影像模型的部署，請確認 AZURE_OPENAI_IMAGE_DEPLOYMENT", res.status);
    throw new ImageGenError(`AI 影像服務回應錯誤（${res.status}）`, res.status);
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new ImageGenError("AI 影像服務沒有回傳照片");
  return new Uint8Array(Buffer.from(b64, "base64"));
}
