import { describe as d, it, expect } from "vitest";
import { describe, isConfigured, resolveModel, resolveProvider } from "./config";

d("AI 供應商設定", () => {
  it("沒有任何金鑰 → 未設定", () => {
    expect(resolveProvider({})).toBeNull();
    expect(isConfigured({})).toBe(false);
    expect(describe({})).toContain("規則式");
  });
  it("只有 Gemini 金鑰 → 自動用 gemini 預設模型", () => {
    const env = { GEMINI_API_KEY: "x" };
    expect(resolveProvider(env)).toBe("gemini");
    expect(isConfigured(env)).toBe(true);
    expect(resolveModel(env, "gemini", "text")).toBe("gemini-3.1-flash-lite");
  });
  it("AI_PROVIDER 指定但缺金鑰 → 未設定", () => {
    expect(isConfigured({ AI_PROVIDER: "openai", GEMINI_API_KEY: "x" })).toBe(false);
  });
  it("相容舊的 LLM_PROVIDER／LLM_MODEL", () => {
    const env = { LLM_PROVIDER: "openai", OPENAI_API_KEY: "x", LLM_MODEL: "gpt-4.1-mini" };
    expect(resolveProvider(env)).toBe("openai");
    expect(resolveModel(env, "openai", "text")).toBe("gpt-4.1-mini");
  });
  it("影像任務可用不同模型", () => {
    const env = { AI_PROVIDER: "gemini", GEMINI_API_KEY: "x", AI_MODEL: "gemini-2.5-flash-lite", AI_MODEL_VISION: "gemini-2.5-pro" };
    expect(resolveModel(env, "gemini", "text")).toBe("gemini-2.5-flash-lite");
    expect(resolveModel(env, "gemini", "vision")).toBe("gemini-2.5-pro");
  });
  it("Azure 需要金鑰、端點、部署名稱三項", () => {
    expect(isConfigured({ AI_PROVIDER: "azure", AZURE_OPENAI_API_KEY: "x" })).toBe(false);
    const env = { AI_PROVIDER: "azure", AZURE_OPENAI_API_KEY: "x", AZURE_OPENAI_ENDPOINT: "https://a.openai.azure.com", AZURE_OPENAI_DEPLOYMENT: "gpt4o-mini" };
    expect(isConfigured(env)).toBe(true);
    expect(resolveModel(env, "azure", "vision")).toBe("gpt4o-mini");
  });
  it("不認得的供應商 → 未設定", () => expect(isConfigured({ AI_PROVIDER: "foo", GEMINI_API_KEY: "x" })).toBe(false));
});
