// #456：跳過任務的疾病提示
import { describe, expect, it } from "vitest";
import { CARE_ACTS } from "./care";
import { MAX_TIPS, SKIP_TIPS, VET_NOTICE, skipTips, skippedActs } from "./skip-tips";

describe("skippedActs", () => {
  it("做過（成功或試過）的不算，其餘都算沒做", () => {
    expect(skippedActs(["feed", "water"], ["scoop"])).toEqual(["play", "pet", "nail", "brush"]);
    expect(skippedActs(CARE_ACTS.map(c => c.act), [])).toEqual([]);
  });
});

describe("skipTips", () => {
  it("每個照顧動作都有提示，不含數字", () => {
    for (const { act } of CARE_ACTS) expect(SKIP_TIPS[act]).toBeTruthy();
    for (const t of Object.values(SKIP_TIPS)) expect(t).not.toMatch(/[0-9０-９]/);
  });
  it("沒跳過任何動作＝不顯示", () => { expect(skipTips([])).toBeNull(); });
  it("影響大的排前面，最多列 MAX_TIPS 項，其餘算在 more", () => {
    const r = skipTips(CARE_ACTS.map(c => c.act))!;
    expect(r.items.map(i => i.act)).toEqual(["scoop", "water", "feed"]);
    expect(r.items).toHaveLength(MAX_TIPS);
    expect(r.more).toBe(CARE_ACTS.length - MAX_TIPS);
  });
  it("只跳過一項就只列一項", () => {
    const r = skipTips(["brush"])!;
    expect(r.items).toEqual([{ act: "brush", label: "刷牙", tip: SKIP_TIPS.brush }]);
    expect(r.more).toBe(0);
  });
  it("獸醫聲明有「僅供參考，非醫療建議」", () => { expect(VET_NOTICE).toContain("僅供參考，非醫療建議"); });
});
