import { describe, expect, it } from "vitest";
import { careGood } from "@/lib/play/care";
import { NEW_WATER, OLD_WATER, REFILL_INTRO_SECONDS, REFILL_SECONDS, REFILL_STEPS, refillAt, refillHold, refillPlayFrame } from "./refill-timeline";

/** 第 i 格開始的秒數 */
const startOf = (i: number) => REFILL_STEPS.slice(0, i).reduce((sum, s) => sum + s.seconds, 0);
const samples = Array.from({ length: Math.ceil(REFILL_SECONDS / 0.05) + 1 }, (_, i) => refillAt(i * 0.05));

describe("換水六格動作的時間軸", () => {
  it("一開始是舊水，倒完到開水龍頭之前碗是空的", () => {
    expect(refillAt(0)).toMatchObject({ step: 0, water: OLD_WATER, dirty: true, open: 0, leftReach: 0 });
    expect(refillAt(startOf(2))).toMatchObject({ step: 2, water: 0, tilt: 0, rightPose: "cradle" });
    expect(refillAt(startOf(4)).water).toBe(0);
  });

  it("倒水那一格右手改握碗緣，而且有一段時間舊水在流", () => {
    const pour = samples.filter((f) => f.step === 1);
    expect(pour.every((f) => f.rightPose === "rim")).toBe(true);
    expect(pour.some((f) => f.pouring)).toBe(true);
    expect(samples.filter((f) => f.step !== 1).some((f) => f.pouring || f.tilt > 0)).toBe(false);
  });

  it("左手握到把手之後水龍頭才開，碗在出水口下才有新水進來", () => {
    for (const f of samples) {
      if (f.open > 0) expect(f.leftReach).toBeGreaterThan(0.9);
      if (!f.dirty && f.water > 0 && f.step === 4) expect(f.under).toBe(1);
    }
  });

  it("結束時水關了、左手離開、碗裡是夠多的新水", () => {
    const end = refillAt(REFILL_SECONDS + 5);
    expect(end).toMatchObject({ step: 5, open: 0, leftReach: 0, under: 0, water: NEW_WATER, dirty: false });
    expect(careGood("water", { fill: Math.round(end.water * 100) })).toBe(true);
  });

  it("水位不會憑空跳動：相鄰兩個時間點差不到一成", () => {
    for (let i = 1; i < samples.length; i++) expect(Math.abs(samples[i].water - samples[i - 1].water)).toBeLessThan(0.1);
  });
});

describe("換水遊戲：玩家按住開水", () => {
  const run = (from: { leftReach: number; open: number }, holding: boolean, seconds: number) => {
    let now = from;
    const seen = [now];
    for (let t = 0; t < seconds; t += 0.05) seen.push(now = refillHold(now, holding, 0.05));
    return seen;
  };

  it("自動播完前三格時，碗是空的、在出水口下", () => {
    expect(refillAt(REFILL_INTRO_SECONDS)).toMatchObject({ step: 3, under: 1, water: 0, open: 0 });
  });

  it("按住：左手先握到把手，水龍頭才開", () => {
    const seen = run({ leftReach: 0, open: 0 }, true, 1);
    expect(seen.every((s) => s.open === 0 || s.leftReach === 1)).toBe(true);
    expect(seen.at(-1)).toEqual({ leftReach: 1, open: 1 });
  });

  it("放開：先關水，左手才離開", () => {
    const seen = run({ leftReach: 1, open: 1 }, false, 1);
    expect(seen.every((s) => s.leftReach === 1 || s.open === 0)).toBe(true);
    expect(seen.at(-1)).toEqual({ leftReach: 0, open: 0 });
  });

  it("畫面的水位照水量，倒過頭也只畫到滿", () => {
    expect(refillPlayFrame({ leftReach: 1, open: 1 }, 35)).toMatchObject({ step: 4, water: 0.35, under: 1, dirty: false });
    expect(refillPlayFrame({ leftReach: 0, open: 0 }, 115)).toMatchObject({ step: 3, water: 1 });
  });
});
