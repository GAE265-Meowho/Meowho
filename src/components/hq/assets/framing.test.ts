// 貓咪預覽取景（#291）：跳躍動作鏡頭拉遠、目標提高，整段跳躍都在畫面內
import { describe, expect, it } from "vitest";
import { framing } from "./CatPreview";

const dist = (v: { camera: number[]; target: number[] }) => Math.hypot(...v.camera.map((c, i) => c - v.target[i]));

describe("framing", () => {
  it("跳躍 A、B：比站姿遠、目標比站姿高（幼貓、成貓都一樣）", () => {
    for (const body of ["kitten", "adult"] as const) {
      const stand = framing(body, "idle");
      for (const clip of ["jump_a", "jump_b"]) {
        const jump = framing(body, clip);
        expect(dist(jump)).toBeGreaterThan(dist(stand) * 1.25);
        expect(jump.target[1]).toBeGreaterThan(stand.target[1]);
        expect(jump.maxDistance).toBeGreaterThanOrEqual(dist(jump));
      }
    }
  });
  it("其他動作維持原本取景", () => {
    expect(framing("kitten", "walk")).toEqual(framing("kitten", null));
    expect(framing("kitten", "sleep").target[1]).toBeLessThan(framing("kitten", null).target[1]);
  });
});
