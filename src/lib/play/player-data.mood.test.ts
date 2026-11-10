import { describe, expect, it } from "vitest";
import { BASE_MOOD, startMood } from "./player-data";

describe("中途評論 → 一開始的信任與壓力", () => {
  it("沒有任何資料就是預設值", () => {
    expect(startMood({})).toEqual({ ...BASE_MOOD, reasons: [] });
  });
  it("很黏人又大膽：信任高、壓力低；膽小怕生慢熱：反過來", () => {
    const easy = startMood({ scale: { bond: 5, brave: 5, adapt: 5 } });
    const shy = startMood({ scale: { bond: 1, brave: 1, adapt: 1 } });
    expect(easy.trust).toBeGreaterThan(BASE_MOOD.trust); expect(easy.stress).toBeLessThan(BASE_MOOD.stress);
    expect(shy.trust).toBeLessThan(BASE_MOOD.trust); expect(shy.stress).toBeGreaterThan(BASE_MOOD.stress);
    expect(easy.reasons).toContain("超黏人");
  });
  it("量表有填就不再重複算標籤", () => {
    expect(startMood({ scale: { bond: 3 }, tags: ["黏人", "親人"] })).toEqual(startMood({ scale: { bond: 3 } }));
  });
  it("沒有量表看標籤，都沒有才看文字關鍵字", () => {
    expect(startMood({ tags: ["怕生", "慢熱"] }).stress).toBe(BASE_MOOD.stress + 12);
    expect(startMood({ text: "很黏人的小孩" }).trust).toBe(BASE_MOOD.trust + 8);
    expect(startMood({ tags: ["怕生"], text: "很黏人" }).trust).toBe(BASE_MOOD.trust - 6);
  });
  it("到家後的反應也算，並限制在合理範圍", () => {
    expect(startMood({ arrival: { hide: "longer", touch: "longer" } })).toMatchObject({ trust: 26, stress: 48 });
    const extreme = startMood({ scale: { bond: 1, brave: 1, adapt: 1 }, tags: ["膽小"], arrival: { hide: "longer", touch: "longer" } });
    expect(extreme.trust).toBeGreaterThanOrEqual(10); expect(extreme.stress).toBeLessThanOrEqual(80);
  });
});
