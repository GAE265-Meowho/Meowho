// 虛擬飼養採買（#354）：每個年齡階段的選飼料小提示
import { describe, expect, it } from "vitest";
import { FOOD_STAGES } from "./costs";
import { FOOD_TIPS, FOOD_TIPS_NOTICE } from "./food-tips";

describe("選飼料小提示", () => {
  it("每個階段有一到兩句，句子不重複", () => {
    for (const st of FOOD_STAGES) {
      expect(FOOD_TIPS[st].length).toBeGreaterThanOrEqual(1);
      expect(FOOD_TIPS[st].length).toBeLessThanOrEqual(2);
      expect(new Set(FOOD_TIPS[st]).size).toBe(FOOD_TIPS[st].length);
    }
  });
  it("內容保守：不下診斷、不寫治療或劑量，也不寫數字（份量、費用只來自資料與公式）", () => {
    const all = FOOD_STAGES.flatMap(st => FOOD_TIPS[st]).join("");
    expect(all).not.toMatch(/診斷|治療|治好|預防|處方|劑量|藥|疾病|腎|\d/);
  });
  it("附上醫療聲明", () => {
    expect(FOOD_TIPS_NOTICE).toContain("僅供參考，非醫療建議");
  });
});
