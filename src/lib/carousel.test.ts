import { describe, expect, it } from "vitest";
import { slideIndex, stepIndex } from "./carousel";

describe("照片輪播", () => {
  it("捲動位置換成第幾張，超出範圍就停在頭尾", () => {
    expect(slideIndex(0, 400, 4)).toBe(0);
    expect(slideIndex(190, 400, 4)).toBe(0);
    expect(slideIndex(210, 400, 4)).toBe(1);
    expect(slideIndex(1200, 400, 4)).toBe(3);
    expect(slideIndex(5000, 400, 4)).toBe(3);
    expect(slideIndex(-30, 400, 4)).toBe(0);
  });

  it("寬度還沒量到或沒有照片時是第 0 張", () => {
    expect(slideIndex(300, 0, 4)).toBe(0);
    expect(slideIndex(300, 400, 0)).toBe(0);
  });

  it("上一張、下一張到頭尾就停住", () => {
    expect(stepIndex(0, -1, 3)).toBe(0);
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});
