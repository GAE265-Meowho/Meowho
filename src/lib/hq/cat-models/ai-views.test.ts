// AI 三視角（#110）：產生流程與 profile.generated 狀態轉換
import { describe, expect, it } from "vitest";
import { ImageGenError } from "@/lib/ai/image";
import { CAT_VIEW_PROMPTS } from "@/lib/prompts/cat-views";
import { failAll, generateViews } from "./ai-views";
import { finishGenerated, generatedState, GEN_TIMEOUT_MS, startGenerated } from "./types";

describe("generateViews", () => {
  it("每個角度用自己的指示產生並存檔；單張失敗不影響其他張", async () => {
    const prompts: string[] = [];
    const results = await generateViews(["left", "front", "back"], {
      edit: async prompt => {
        prompts.push(prompt);
        if (prompt === CAT_VIEW_PROMPTS.back) throw new ImageGenError("AI 影像服務忙碌中，請稍後重新產生");
        return new Uint8Array([1]);
      },
      save: async view => `cat_1/gen_${view}.png`,
    });
    expect(prompts.sort()).toEqual([CAT_VIEW_PROMPTS.left, CAT_VIEW_PROMPTS.front, CAT_VIEW_PROMPTS.back].sort());
    expect(results).toEqual({
      left: { path: "cat_1/gen_left.png" }, front: { path: "cat_1/gen_front.png" },
      back: { error: "AI 影像服務忙碌中，請稍後重新產生" },
    });
  });
  it("不是 ImageGenError 的錯誤用通用訊息；failAll 全部同一個原因", async () => {
    const r = await generateViews(["left"], { edit: async () => { throw new Error("x"); }, save: async () => "" });
    expect(r).toEqual({ left: { error: "產生失敗，請重新產生" } });
    expect(failAll(["left", "back"], "讀不到原始照片")).toEqual({ left: { error: "讀不到原始照片" }, back: { error: "讀不到原始照片" } });
  });
  it("左側面的指示要求頭朝畫面左邊（對應 paint_worker 的 view=left）", () => {
    expect(CAT_VIEW_PROMPTS.left).toMatch(/head is on the left side/);
  });
});

describe("profile.generated 狀態", () => {
  const now = new Date("2026-11-02T00:00:00Z");
  it("開始：標記產生中、清掉這些角度的舊錯誤", () => {
    const g = startGenerated({ views: { left: "a" }, errors: { back: "x", front: "y" } }, ["back"], now);
    expect(g).toEqual({ views: { left: "a" }, errors: { front: "y" }, running: ["back"], started_at: now.toISOString() });
    expect(generatedState(g, now.getTime())).toEqual({ aiViews: ["left"], aiRunning: ["back"], aiErrors: { front: "y" } });
  });
  it("結束：成功記路徑、失敗記原因、產生中清空", () => {
    const g = finishGenerated(startGenerated(undefined, ["left", "back"], now), { left: { path: "p" }, back: { error: "e" } });
    expect(generatedState(g, now.getTime())).toEqual({ aiViews: ["left"], aiRunning: [], aiErrors: { back: "e" } });
  });
  it("產生中超過時限視為失敗", () => {
    const g = startGenerated(undefined, ["front"], now);
    expect(generatedState(g, now.getTime() + GEN_TIMEOUT_MS + 1)).toEqual({ aiViews: [], aiRunning: [], aiErrors: { front: "產生逾時，請重新產生" } });
  });
  it("沒有資料：全空", () => expect(generatedState(undefined)).toEqual({ aiViews: [], aiRunning: [], aiErrors: {} }));
});
