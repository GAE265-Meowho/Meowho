import { describe, expect, it } from "vitest";
import { newPetState, petResult, petStroke, type PetStroke } from "./pet-rules";

const stroke = (overrides: Partial<PetStroke> = {}): PetStroke => ({
  zone: "head", distancePx: 12, dt: 0.04, touching: true,
  favorite: "head", trust: 60, stress: 30, ...overrides,
});

describe("3D 摸貓判定（#356）", () => {
  it("最喜歡的部位比其他安全部位增加更多開心值", () => {
    const favorite = petStroke(newPetState(), stroke());
    const other = petStroke(newPetState(), stroke({ zone: "back" }));
    expect(favorite.fun).toBeGreaterThan(other.fun);
  });
  it("肚子、尾巴不增加開心，反而提升煩躁", () => {
    for (const zone of ["belly", "tail"] as const) {
      const next = petStroke(newPetState(), stroke({ zone }));
      expect(next.fun).toBe(0);
      expect(next.annoyance).toBeGreaterThan(0);
    }
  });
  it("動作過快會讓貓煩躁，不給正面回饋", () => {
    const next = petStroke(newPetState(), stroke({ distancePx: 50, dt: 0.02 }));
    expect(next.fun).toBe(0);
    expect(next.annoyance).toBeGreaterThan(0);
  });
  it("放開手指後不繼續計分，並緩慢降低煩躁", () => {
    const next = petStroke({ fun: 40, annoyance: 20, ran: false }, stroke({ touching: false }));
    expect(next.fun).toBe(40);
    expect(next.annoyance).toBeLessThan(20);
  });
  it("煩躁到 100 即跑掉，並且不能再刷出開心值", () => {
    const next = petStroke({ fun: 5, annoyance: 99, ran: false }, stroke({ zone: "tail", distancePx: 40 }));
    expect(next.ran).toBe(true);
    expect(petStroke(next, stroke())).toEqual(next);
  });
  it("結果格式可直接交給 careGood", () => {
    expect(petResult({ fun: 65.6, annoyance: 20, ran: false })).toEqual({ fun: 66, ran: false });
  });
});
