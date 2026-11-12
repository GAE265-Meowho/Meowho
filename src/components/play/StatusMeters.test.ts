import { describe, expect, it } from "vitest";
import { iconCount } from "./StatusMeters";

describe("愛心與火焰的顆數", () => {
  it("有值就先亮一顆，滿格五顆，超出範圍收進 0～5", () => {
    expect([0, 1, 20, 21, 40, 41, 60, 80, 81, 100].map(iconCount)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 5, 5]);
    expect(iconCount(-10)).toBe(0);
    expect(iconCount(250)).toBe(5);
  });
});
