import { describe, expect, it } from "vitest";
import { MAX_END_MONTHS, nodeLabel, realMonths, spanMonths } from "./timeline";

describe("時間軸", () => {
  it("2 個月的小貓照劇本走：結尾 15 歲", () => {
    expect(realMonths(2, 2)).toBe(2);
    expect(realMonths(8, 2)).toBe(8);
    expect(realMonths(60, 2)).toBe(60);
    expect(realMonths(180, 2)).toBe(180);
    expect(nodeLabel({ id: "year5", label: "五年後", age: 60 }, 2)).toBe("5 年後");
    expect(nodeLabel({ id: "year10", label: "十年後", age: 120 }, 2)).toBe("10 年後");
  });
  it("年紀大的貓：前半年照走，之後壓縮，結尾不超過 20 歲", () => {
    const start = 14 * 12;
    expect(realMonths(8, start)).toBe(start + 6);
    expect(realMonths(180, start)).toBe(MAX_END_MONTHS);
    expect(realMonths(60, start)).toBeLessThan(realMonths(120, start));
    expect(realMonths(120, start)).toBeLessThan(MAX_END_MONTHS);
    for (const s of [2, 12, 36, 84, 120, 168, 216, 300]) expect(realMonths(180, s) - s).toBeGreaterThanOrEqual(12);
    expect(realMonths(180, 24)).toBeLessThanOrEqual(MAX_END_MONTHS);
  });
  it("已經很老的貓至少還有 12 個月", () => {
    expect(spanMonths(240)).toBe(12);
    expect(spanMonths(300)).toBe(12);
    expect(realMonths(180, 240)).toBe(252);
  });
  it("年數標籤用壓縮後的年數", () => {
    expect(nodeLabel({ id: "year10", label: "十年後", age: 120 }, 168)).toBe("4 年後");
    expect(nodeLabel({ id: "day1", label: "第 1 天", age: 2 }, 168)).toBe("第 1 天");
  });
});
