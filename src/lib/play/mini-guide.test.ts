import { describe, expect, it } from "vitest";
import { MINI_GUIDES, guideKey, guideSkipped, guideText, setGuideSkipped, type GuideId } from "./mini-guide";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("小遊戲開始前的示範", () => {
  it("每個小遊戲都有 2～4 張示範圖，每張都有說明", () => {
    const ids: GuideId[] = ["feed", "water", "scoop", "pet", "brush", "nail", "play"];
    for (const id of ids) {
      const g = MINI_GUIDES[id];
      expect(g.steps.length, id).toBeGreaterThanOrEqual(2);
      expect(g.steps.length, id).toBeLessThanOrEqual(4);
      // 說明要短（2026-11-14 渝茜：約原本的 1/3）
      for (const s of g.steps) { expect(s.text.length, id).toBeGreaterThanOrEqual(4); expect(s.text.length, id).toBeLessThanOrEqual(12); }
    }
  });

  it("勾了「下次不再顯示」就記住，取消勾選就恢復", () => {
    const s = memory();
    expect(guideSkipped("feed", s)).toBe(false);
    setGuideSkipped("feed", true, s);
    expect(guideSkipped("feed", s)).toBe(true);
    expect(guideSkipped("water", s)).toBe(false);
    setGuideSkipped("feed", false, s);
    expect(guideSkipped("feed", s)).toBe(false);
    expect(guideKey("feed")).toBe("meowho.play.guide.v1.feed");
  });

  it("存不了（私密模式）也不會壞", () => {
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(guideSkipped("feed", broken)).toBe(false);
    expect(() => setGuideSkipped("feed", true, broken)).not.toThrow();
    expect(guideSkipped("feed", null)).toBe(false);
  });

  it("〈貓名〉換成這隻貓", () => {
    expect(guideText(MINI_GUIDES.play.steps[1].text, "灰寶")).toContain("灰寶");
  });
});
