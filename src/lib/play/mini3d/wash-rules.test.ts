import { describe, expect, it } from "vitest";
import { dumpFrame, newScrub, RINSE_SECONDS, RINSE_WATER, rinseStep, scrubClean, scrubStep, type ScrubState } from "./wash-rules";

/** 菜瓜布在碗裡繞 turns 圈（半徑 3 公分，每步 0.2 弧度；dir 1 逆時針、-1 順時針） */
const circle = (s: ScrubState, turns: number, dir = 1) => {
  for (let a = 0; a <= turns * 2 * Math.PI; a += 0.2) s = scrubStep(s, Math.cos(dir * a) * 0.03, Math.sin(dir * a) * 0.03, true);
  return s;
};

describe("洗碗：菜瓜布搓碗", () => {
  it("畫圈約 3 圈洗乾淨，順時針、逆時針都算", () => {
    expect(scrubClean(circle(newScrub(), 1.5))).toBeGreaterThan(0.4);
    expect(scrubClean(circle(newScrub(), 3.3))).toBe(1);
    expect(scrubClean(circle(newScrub(), 3.3, -1))).toBe(1);
  });

  it("換方向、來回搓都只會增加，不會倒扣", () => {
    let s = circle(newScrub(), 1);
    const before = scrubClean(s);
    s = circle(s, 0.5, -1);
    expect(scrubClean(s)).toBeGreaterThan(before);
    let prev = scrubClean(s);
    for (let i = 0; i < 40; i++) {
      s = scrubStep(s, i % 2 ? 0.02 : -0.02, 0, true);
      expect(scrubClean(s)).toBeGreaterThanOrEqual(prev);
      prev = scrubClean(s);
    }
    expect(prev).toBeGreaterThan(before);
  });

  it("放開手、移出碗外、一下跳很遠都不算", () => {
    let s = newScrub();
    for (let a = 0; a < 10; a += 0.2) s = scrubStep(s, Math.cos(a) * 0.03, Math.sin(a) * 0.03, false);
    expect(scrubClean(s)).toBe(0);
    for (let a = 0; a < 10; a += 0.2) s = scrubStep(s, Math.cos(a) * 0.2, Math.sin(a) * 0.2, true);
    expect(scrubClean(s)).toBe(0);
    expect(scrubStep(scrubStep(newScrub(), 0.03, 0, true), -0.03, 0, true).moved).toBe(0);
  });
});

describe("沖碗、倒掉沖碗的水", () => {
  it(`水開著約 ${RINSE_SECONDS} 秒泡泡沖光，碗裡最多積 ${RINSE_WATER}；水沒開不會變`, () => {
    let s = { foam: 1, water: 0 };
    expect(rinseStep(s, 0.2, 0.05)).toEqual(s);
    for (let t = 0; t < RINSE_SECONDS + 0.05; t += 0.05) s = rinseStep(s, 1, 0.05);
    expect(s.foam).toBe(0);
    expect(s.water).toBe(RINSE_WATER);
  });

  it("倒水：一開始和最後碗是正的，中間傾斜時水流出去，最後碗是空的", () => {
    expect(dumpFrame(0)).toMatchObject({ tilt: 0, water: 1, pouring: false });
    expect(dumpFrame(1)).toMatchObject({ tilt: 0, water: 0, pouring: false });
    expect(dumpFrame(0.45).pouring).toBe(true);
  });
});
