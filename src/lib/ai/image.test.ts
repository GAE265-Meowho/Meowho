// AI 影像生成（#110）：設定、v1／舊版網址、多張參考照片、用量、各種失敗的白話訊息。用假的 fetch，不連線。
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_IMAGE_API_VERSION, editImage, ImageGenError, imageConfig, imageEditUrl } from "./image";

const v1 = { AZURE_OPENAI_ENDPOINT: "https://r.openai.azure.com/openai/v1/", AZURE_OPENAI_API_KEY: "k", AZURE_OPENAI_IMAGE_DEPLOYMENT: "gpt-image-2" };
const cfg = imageConfig(v1)!;
const ref = { bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg" };
const ok = (usage?: unknown) => ({ data: [{ b64_json: Buffer.from("PNG").toString("base64") }], usage });
const reply = (...bodies: [number, unknown][]) => {
  const f = vi.fn();
  for (const [status, body] of bodies) f.mockImplementationOnce(async () => new Response(JSON.stringify(body), { status }));
  return f;
};
const formOf = (f: ReturnType<typeof vi.fn>, call = 0) => (f.mock.calls[call] as unknown as [string, RequestInit])[1].body as FormData;

describe("imageConfig／imageEditUrl", () => {
  it("三項都有才算設定好；畫質預設 low；去掉結尾斜線", () => {
    expect(cfg).toEqual({ endpoint: "https://r.openai.azure.com/openai/v1", apiKey: "k", deployment: "gpt-image-2", apiVersion: DEFAULT_IMAGE_API_VERSION, quality: "low" });
    expect(imageConfig({ ...v1, AZURE_OPENAI_IMAGE_DEPLOYMENT: "" })).toBeNull();
    expect(imageConfig({ ...v1, AZURE_OPENAI_IMAGE_QUALITY: "High" })?.quality).toBe("high");
    expect(imageConfig({ ...v1, AZURE_OPENAI_IMAGE_QUALITY: "ultra" })?.quality).toBe("low");
  });
  it("v1 端點：/images/edits，不含部署名稱；舊版端點：deployments 路徑＋api-version", () => {
    expect(imageEditUrl(cfg)).toBe("https://r.openai.azure.com/openai/v1/images/edits");
    const old = imageConfig({ ...v1, AZURE_OPENAI_ENDPOINT: "https://r.openai.azure.com" })!;
    expect(imageEditUrl(old)).toBe(`https://r.openai.azure.com/openai/deployments/gpt-image-2/images/edits?api-version=${DEFAULT_IMAGE_API_VERSION}`);
  });
});

describe("editImage", () => {
  it("v1：部署名稱放 model、帶畫質；回傳 PNG 與分項用量", async () => {
    const f = reply([200, ok({ input_tokens: 1288, output_tokens: 196, input_tokens_details: { text_tokens: 300, image_tokens: 988 } })]);
    const out = await editImage(cfg, { refs: [ref], prompt: "p" }, f);
    expect(Buffer.from(out.png).toString()).toBe("PNG");
    expect(out.usage).toEqual({ input: 1288, output: 196, textIn: 300, imageIn: 988 });
    const form = formOf(f);
    expect(form.get("model")).toBe("gpt-image-2");
    expect(form.get("quality")).toBe("low");
    expect(form.get("image")).not.toBeNull();
  });
  it("多張參考照片用 image[]；被拒（400）時改用第一張重試", async () => {
    const f = reply([400, { error: { code: "invalid_value" } }], [200, ok()]);
    const out = await editImage(cfg, { refs: [ref, ref], prompt: "p" }, f);
    expect(out.usage).toBeNull();
    expect(formOf(f, 0).getAll("image[]")).toHaveLength(2);
    expect(formOf(f, 1).getAll("image")).toHaveLength(1);
  });
  it("失敗轉成白話訊息", async () => {
    await expect(editImage(cfg, { refs: [ref], prompt: "p" }, reply([429, {}]))).rejects.toThrow("忙碌中");
    await expect(editImage(cfg, { refs: [ref], prompt: "p" }, reply([400, { error: { code: "content_filter" } }]))).rejects.toThrow("內容審核");
    await expect(editImage(cfg, { refs: [ref], prompt: "p" }, reply([404, {}]))).rejects.toThrow("AZURE_OPENAI_IMAGE_DEPLOYMENT");
    await expect(editImage(cfg, { refs: [ref], prompt: "p" }, reply([200, { data: [] }]))).rejects.toThrow("沒有回傳照片");
    await expect(editImage(cfg, { refs: [ref], prompt: "p" }, vi.fn(async () => { throw new Error("net"); }))).rejects.toBeInstanceOf(ImageGenError);
  });
});
