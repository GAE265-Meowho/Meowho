import { describe, expect, it } from "vitest";
import { HEALTH_TAGS, PERSONALITY_TAGS, pickTags } from "./tags";

describe("固定標籤清單", () => {
  it("個性標籤暫定 12 個（#58 會調整）", () => {
    expect(PERSONALITY_TAGS).toHaveLength(12);
    expect(PERSONALITY_TAGS).toContain("親其他貓");
  });
  it("健康標籤 8 個", () => {
    expect(HEALTH_TAGS).toHaveLength(8);
    expect(HEALTH_TAGS).toContain("需每日用藥");
  });
});

describe("pickTags：只留清單內的標籤", () => {
  it("過濾掉清單外的字、去除重複、依清單順序排列", () => {
    expect(pickTags(["愛玩", "超可愛", "親人", "愛玩"], PERSONALITY_TAGS)).toEqual(["親人", "愛玩"]);
  });
  it("前後空白不影響比對", () => {
    expect(pickTags([" 已結紮 "], HEALTH_TAGS)).toEqual(["已結紮"]);
  });
});
