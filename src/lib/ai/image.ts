// AI 影像生成（#110）：以參考照片產生新照片（image edit）。業務程式只呼叫這裡，不直接用供應商 API。
// 目前接 Azure OpenAI 的 gpt-image 系列（2026-11-02 實測 gpt-image-2 可用；gpt-6-luna 是聊天模型，不能產圖）。
// 環境變數：AZURE_OPENAI_ENDPOINT、AZURE_OPENAI_API_KEY（與文字模型共用）、AZURE_OPENAI_IMAGE_DEPLOYMENT，
// 選填 AZURE_OPENAI_IMAGE_QUALITY（low／medium／high，預設 low）、AZURE_OPENAI_IMAGE_API_VERSION（只有舊版端點用）。
import { isAzureV1 } from "./config";

type Env = Record<string, string | undefined>;

export const DEFAULT_IMAGE_API_VERSION = "2025-04-01-preview";
export const IMAGE_QUALITIES = ["low", "medium", "high"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

export interface ImageConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  quality: ImageQuality;
}

/** 影像生成設定；缺任一項回 null（畫面顯示「尚未設定 AI 影像模型」） */
export function imageConfig(env: Env = process.env): ImageConfig | null {
  const endpoint = env.AZURE_OPENAI_ENDPOINT?.trim();
  const apiKey = env.AZURE_OPENAI_API_KEY?.trim();
  const deployment = env.AZURE_OPENAI_IMAGE_DEPLOYMENT?.trim();
  if (!endpoint || !apiKey || !deployment) return null;
  const q = env.AZURE_OPENAI_IMAGE_QUALITY?.trim().toLowerCase();
  return {
    endpoint: endpoint.replace(/\/+$/, ""), apiKey, deployment,
    apiVersion: env.AZURE_OPENAI_IMAGE_API_VERSION?.trim() || DEFAULT_IMAGE_API_VERSION,
    quality: (IMAGE_QUALITIES as readonly string[]).includes(q ?? "") ? (q as ImageQuality) : "low",
  };
}

/** 影像編輯 API 的網址：v1 端點不含部署名稱（放在 model 欄位）；舊版端點部署名稱在網址裡、要帶 api-version */
export function imageEditUrl(cfg: ImageConfig): string {
  if (isAzureV1(cfg.endpoint)) return `${cfg.endpoint}/images/edits`;
  return `${cfg.endpoint}/openai/deployments/${encodeURIComponent(cfg.deployment)}/images/edits?api-version=${encodeURIComponent(cfg.apiVersion)}`;
}

export class ImageGenError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

/** 一次產生的用量（gpt-image 回應的 usage；沒有細項時 textIn／imageIn 為 null） */
export interface ImageUsage {
  input: number;
  output: number;
  textIn: number | null;
  imageIn: number | null;
}

export interface Reference { bytes: Uint8Array; mime: string }

const ext = (mime: string) => (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");

function buildForm(cfg: ImageConfig, refs: Reference[], prompt: string, size: string): FormData {
  const form = new FormData();
  // 多張參考照片用 image[]（gpt-image 支援）；一張用 image
  const field = refs.length > 1 ? "image[]" : "image";
  refs.forEach((r, i) => form.append(field, new Blob([new Uint8Array(r.bytes)], { type: r.mime }), `reference_${i + 1}.${ext(r.mime)}`));
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", cfg.quality);
  form.append("n", "1");
  if (isAzureV1(cfg.endpoint)) form.append("model", cfg.deployment);
  return form;
}

type Reply = {
  data?: { b64_json?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } };
  error?: { code?: string; message?: string };
};

function toError(status: number, json: Reply | null): ImageGenError {
  const code = json?.error?.code ?? "";
  if (status === 429) return new ImageGenError("AI 影像服務忙碌中，請稍後重新產生", status);
  if (code === "content_filter" || code === "moderation_blocked") return new ImageGenError("照片被 AI 內容審核擋下，請換一張照片", status);
  if (status === 401 || status === 403) return new ImageGenError("AI 影像服務的金鑰或權限有問題", status);
  if (status === 404) return new ImageGenError("找不到 AI 影像模型的部署，請確認 AZURE_OPENAI_IMAGE_DEPLOYMENT 與端點", status);
  return new ImageGenError(`AI 影像服務回應錯誤（${status}）`, status);
}

/**
 * 以參考照片產生一張新照片，回傳 PNG 與用量。
 * 多張參考照片被拒（400）時改用第一張重試。失敗時丟出 ImageGenError，訊息是白話，不含金鑰或原始回應全文。
 */
export async function editImage(
  cfg: ImageConfig,
  input: { refs: Reference[]; prompt: string; size?: string },
  fetcher: typeof fetch = fetch,
): Promise<{ png: Uint8Array; usage: ImageUsage | null }> {
  if (!input.refs.length) throw new ImageGenError("沒有參考照片");
  const size = input.size ?? "1024x1024";
  const send = async (refs: Reference[]) => {
    try {
      const res = await fetcher(imageEditUrl(cfg), { method: "POST", headers: { "api-key": cfg.apiKey }, body: buildForm(cfg, refs, input.prompt, size) });
      return { res, json: (await res.json().catch(() => null)) as Reply | null };
    } catch {
      throw new ImageGenError("連不到 AI 影像服務");
    }
  };
  let { res, json } = await send(input.refs);
  if (res.status === 400 && input.refs.length > 1 && json?.error?.code !== "content_filter") ({ res, json } = await send(input.refs.slice(0, 1)));
  if (!res.ok) throw toError(res.status, json);
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new ImageGenError("AI 影像服務沒有回傳照片");
  const u = json?.usage;
  const usage = u ? {
    input: u.input_tokens ?? 0, output: u.output_tokens ?? 0,
    textIn: u.input_tokens_details?.text_tokens ?? null, imageIn: u.input_tokens_details?.image_tokens ?? null,
  } : null;
  return { png: new Uint8Array(Buffer.from(b64, "base64")), usage };
}
