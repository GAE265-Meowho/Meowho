import { describe, expect, it } from "vitest";
import { EXTRA_PERSONALITY_TAGS, HEALTH_TAGS, PERSONALITY_TAGS, SCALE_TAGS, TRAITS, emptyScale, personalityTags, pickTags } from "./tags";

describe("固定標籤清單（照設計稿，#206）", () => {
  it("個性標籤：量表產生的 10 個＋可以加點的 12 個", () => {
    expect(SCALE_TAGS).toHaveLength(10);
    expect(EXTRA_PERSONALITY_TAGS).toHaveLength(12);
    expect(PERSONALITY_TAGS).toHaveLength(22);
    expect(PERSONALITY_TAGS).not.toContain("安靜");
  });
  it("健康標籤是身體狀況；結紮、疫苗、驅蟲、FIV／FeLV、晶片不在標籤裡", () => {
    expect(HEALTH_TAGS).toHaveLength(11);
    expect(HEALTH_TAGS).toContain("每天吃藥");
    for (const t of ["已結紮", "疫苗已完成", "已驅蟲", "FIV 陽性"]) expect(HEALTH_TAGS).not.toContain(t);
  });
  it("四條拉桿，每條 5 個節點", () => {
    expect(TRAITS.map((t) => t.key)).toEqual(["energy", "bond", "brave", "adapt"]);
    for (const t of TRAITS) expect(t.words).toHaveLength(5);
  });
});

describe("pickTags：只留清單內的標籤", () => {
  it("過濾掉清單外的字、去除重複、依清單順序排列", () => {
    expect(pickTags(["愛玩", "超可愛", "親人", "愛玩"], PERSONALITY_TAGS)).toEqual(["親人", "愛玩"]);
  });
  it("前後空白不影響比對", () => {
    expect(pickTags([" 每天吃藥 "], HEALTH_TAGS)).toEqual(["每天吃藥"]);
  });
});

describe("UT-03-07：四條拉桿產生的個性標籤", () => {
  it("沒拉過（還沒選）不產生標籤，中間是普通也不產生", () => {
    expect(personalityTags(emptyScale())).toEqual([]);
    expect(personalityTags({ energy: 3, bond: 3, brave: 3, adapt: 3 })).toEqual([]);
  });
  it("兩端各自產生標籤", () => {
    expect(personalityTags({ energy: 1, bond: 5, brave: 5, adapt: 4 })).toEqual(["慵懶", "黏人", "親人", "適應力好"]);
    expect(personalityTags({ energy: 5, bond: 1, brave: 1, adapt: 2 })).toEqual(["活潑", "獨立", "膽小", "怕生", "慢熱"]);
    expect(personalityTags({ brave: 2 })).toEqual(["怕生"]);
  });
  it("不會有矛盾的標籤：同一條拉桿只落在一側", () => {
    const pairs = [["慵懶", "活潑"], ["獨立", "黏人"], ["怕生", "親人"], ["慢熱", "適應力好"]];
    for (let v = 1; v <= 5; v++) {
      const tags = personalityTags({ energy: v, bond: v, brave: v, adapt: v });
      for (const [a, b] of pairs) expect(tags.includes(a as never) && tags.includes(b as never)).toBe(false);
    }
  });
  it("中途加點的只留可以加點的；咬人或抓人帶出「愛咬人」", () => {
    expect(personalityTags({ bond: 5 }, ["愛踏踏", "黏人", "超可愛"], true)).toEqual(["黏人", "愛咬人", "愛踏踏"]);
  });
  it("拉桿超出 1–5 的值不算", () => {
    expect(personalityTags({ energy: 0, bond: 6 })).toEqual([]);
  });
});
