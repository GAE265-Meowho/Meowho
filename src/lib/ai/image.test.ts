// AI 影像生成（#110）：設定、網址、成功與各種失敗的白話訊息。用假的 fetch，不連線。
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_IMAGE_API_VERSION, editImage, ImageGenError, imageConfig, imageEditUrl } from "./image";

const env = { AZURE_OPENAI_ENDPOINT: "https://x.openai.azure.com/", AZURE_OPENAI_API_KEY: "k", AZURE_OPENAI_IMAGE_DEPLOYMENT: "gpt-6-luna" };
const cfg = imageConfig(env)!;
const input = { image: new Uint8Array([1, 2, 3]), mime: "image/jpeg", prompt: "p" };
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("imageConfig", () => {
  it("三項都有才算設定好；版本有預設值；去掉結尾斜線", () => {
    expect(cfg).toEqual({ endpoint: "https://x.openai.azure.com", apiKey: "k", deployment: "gpt-6-luna", apiVersion: DEFAULT_IMAGE_API_VERSION });
    expect(imageConfig({ ...env, AZURE_OPENAI_IMAGE_DEPLOYMENT: "" })).toBeNull();
    expect(imageConfig({ ...env, AZURE_OPENAI_IMAGE_API_VERSION: "2025-06-01" })?.apiVersion).toBe("2025-06-01");
  });
  it("網址指向該部署的 images/edits", () => {
    expect(imageEditUrl(cfg)).toBe(`https://x.openai.azure.com/openai/deployments/gpt-6-luna/images/edits?api-version=${DEFAULT_IMAGE_API_VERSION}`);
  });
});

describe("editImage", () => {
  it("成功：帶 api-key 標頭、回傳解碼後的 PNG", async () => {
    const f = reply(200, { data: [{ b64_json: Buffer.from("PNG").toString("base64") }] });
    const out = await editImage(cfg, input, f);
    expect(Buffer.from(out).toString()).toBe("PNG");
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["api-key"]).toBe("k");
    expect((init.body as FormData).get("prompt")).toBe("p");
  });
  it("失敗轉成白話訊息", async () => {
    await expect(editImage(cfg, input, reply(429, {}))).rejects.toThrow("忙碌中");
    await expect(editImage(cfg, input, reply(400, { error: { code: "content_filter" } }))).rejects.toThrow("內容審核");
    await expect(editImage(cfg, input, reply(404, {}))).rejects.toThrow("AZURE_OPENAI_IMAGE_DEPLOYMENT");
    await expect(editImage(cfg, input, reply(200, { data: [] }))).rejects.toThrow("沒有回傳照片");
    await expect(editImage(cfg, input, vi.fn(async () => { throw new Error("net"); }))).rejects.toBeInstanceOf(ImageGenError);
  });
});
