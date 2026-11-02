// AI 三視角（#110）：年齡判斷、產生流程與 profile.generated 狀態轉換
import { describe, expect, it } from "vitest";
import { ImageGenError } from "@/lib/ai/image";
import { buildViewPrompt, CAT_VIEW_PROMPTS } from "@/lib/prompts/cat-views";
import { failAll, generateViews, resolveAge } from "./ai-views";
import { finishGenerated, generatedState, GEN_TIMEOUT_MS, imageCostUsd, startGenerated } from "./types";

const ref = { bytes: new Uint8Array([1]), mime: "image/jpeg" };
const usage = { input: 1288, output: 196, textIn: null, imageIn: null };

describe("resolveAge", () => {
  it("AI 估得出月齡用 AI；估不出來用表單；都沒有是 null；AI 失敗不擋", async () => {
    const ai = { months: 3, isCat: true, coat: "橘白", breed: null, confidence: 0.9 };
    expect(await resolveAge({ refs: [ref], analyze: async () => ai, formAgeMonths: 24 })).toEqual({ ...ai, source: "ai" });
    expect(await resolveAge({ refs: [ref], analyze: async () => ({ ...ai, months: null }), formAgeMonths: 24 })).toMatchObject({ months: 24, source: "form", coat: "橘白" });
    expect(await resolveAge({ refs: [ref], analyze: async () => { throw new Error("x"); } })).toMatchObject({ months: null, source: null });
  });
});

describe("generateViews", () => {
  it("先判斷年齡，再用含年齡與參考照片說明的指示產生；單張失敗不影響其他張", async () => {
    const sent: string[] = [];
    const out = await generateViews(["left", "front", "back"], {
      refs: [ref, ref],
      analyze: async () => ({ months: 3, isCat: true, coat: null, breed: null, confidence: 0.8 }),
      edit: async (refs, prompt) => {
        sent.push(prompt);
        expect(refs).toHaveLength(2);
        if (prompt.includes("rear view")) throw new ImageGenError("AI 影像服務忙碌中，請稍後重新產生");
        return { png: new Uint8Array([1]), usage };
      },
      save: async view => `cat_1/gen_${view}.png`,
    });
    expect(out.age).toMatchObject({ months: 3, source: "ai" });
    expect(sent.every(p => p.includes("This is a kitten") && p.includes("Reference images 1-2"))).toBe(true);
    expect(out.prompts.left).toEqual(buildViewPrompt("left", { ageMonths: 3, refCount: 2 }));
    expect(out.prompts.left!.zh).toContain("這是幼貓");
    expect(out.results).toEqual({
      left: { path: "cat_1/gen_left.png", usage }, front: { path: "cat_1/gen_front.png", usage },
      back: { error: "AI 影像服務忙碌中，請稍後重新產生" },
    });
  });
  it("不是 ImageGenError 的錯誤用通用訊息；failAll 全部同一個原因", async () => {
    const out = await generateViews(["left"], { refs: [ref], edit: async () => { throw new Error("x"); }, save: async () => "" });
    expect(out.results).toEqual({ left: { error: "產生失敗，請重新產生" } });
    expect(failAll(["left", "back"], "讀不到原始照片")).toEqual({ left: { error: "讀不到原始照片" }, back: { error: "讀不到原始照片" } });
  });
  it("左側面的指示要求頭朝畫面左邊、站姿；背部不畫臉；成貓不加幼貓指示", () => {
    expect(CAT_VIEW_PROMPTS.left.en).toMatch(/head on the left side/);
    expect(CAT_VIEW_PROMPTS.left.en).toMatch(/not walking/);
    expect(CAT_VIEW_PROMPTS.back.en).toMatch(/face, eyes and nose are NOT visible/);
    expect(buildViewPrompt("front", { ageMonths: 24 }).en).toMatch(/adult cat/);
    expect(buildViewPrompt("front", {}).en).toBe(CAT_VIEW_PROMPTS.front.en);
  });
});

describe("profile.generated 狀態", () => {
  const now = new Date("2026-11-02T00:00:00Z");
  it("開始：標記產生中、清掉舊錯誤、記畫質", () => {
    const g = startGenerated({ views: { left: "a" }, errors: { back: "x", front: "y" } }, ["back"], now, { quality: "medium" });
    expect(g).toEqual({ views: { left: "a" }, errors: { front: "y" }, running: ["back"], started_at: now.toISOString(), quality: "medium" });
    expect(generatedState(g, now.getTime())).toMatchObject({ aiViews: ["left"], aiRunning: ["back"], aiErrors: { front: "y" }, aiQuality: "medium" });
  });
  it("結束：成功記路徑與用量、失敗記原因、記年齡與指示", () => {
    const age = { months: 3, isCat: true, coat: null, breed: null, confidence: 0.8, source: "ai" as const };
    const prompts = { left: { en: "e", zh: "中" } };
    const g = finishGenerated(startGenerated(undefined, ["left", "back"], now), { left: { path: "p", usage }, back: { error: "e" } }, { age, prompts });
    expect(generatedState(g, now.getTime())).toMatchObject({
      aiViews: ["left"], aiRunning: [], aiErrors: { back: "e" }, aiAge: age, aiPrompts: prompts, aiUsage: { left: usage },
    });
  });
  it("產生中超過時限視為失敗", () => {
    const g = startGenerated(undefined, ["front"], now);
    expect(generatedState(g, now.getTime() + GEN_TIMEOUT_MS + 1)).toMatchObject({ aiRunning: [], aiErrors: { front: "產生逾時，請重新產生" } });
  });
  it("費用：有分項依文字／圖片計價，沒分項輸入全部用圖片價", () => {
    expect(imageCostUsd({ input: 1288, output: 196, textIn: 300, imageIn: 988 })).toBeCloseTo((300 * 5 + 988 * 8 + 196 * 30) / 1e6, 8);
    expect(imageCostUsd(usage)).toBeCloseTo((1288 * 8 + 196 * 30) / 1e6, 8);
  });
});
