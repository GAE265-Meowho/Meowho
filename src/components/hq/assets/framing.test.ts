// 貓咪預覽取景（#291）：跳躍動作鏡頭拉遠、目標提高，整段跳躍都在畫面內
import { describe, expect, it } from "vitest";
import { CABINET, CABINET_ADULT, framing, propFor } from "./CatPreview";

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

describe("跳躍 C 櫃子（#293）", () => {
  it("只有 jump_c 畫櫃子；尺寸和 stepC_clips.py 一致（高 0.32 m，前緣在貓起跳點前方）", () => {
    expect(propFor("jump_c", "kitten")).toEqual(CABINET);
    expect(propFor("jump_b", "kitten")).toBeNull();
    expect(propFor("jump_c", "adult")).toEqual(CABINET_ADULT);
    expect(CABINET.size[1]).toBeCloseTo(0.32);
    // glTF 座標：貓面向 +Z；櫃子在貓後方（z 為負），櫃面頂端 = 高度
    expect(CABINET.position[1] + CABINET.size[1] / 2).toBeCloseTo(0.32);
    expect(CABINET.position[2] + CABINET.size[2] / 2).toBeLessThan(0);
  });
  it("jump_c 鏡頭比其他跳躍更遠，看得到櫃子與落地點", () => {
    const c = framing("kitten", "jump_c");
    const b = framing("kitten", "jump_b");
    expect(dist(c)).toBeGreaterThan(dist(b));
    expect(c.maxDistance).toBeGreaterThanOrEqual(dist(c));
  });
});

describe("成貓跳躍 C 櫃子（#295）", () => {
  it("櫃面高 0.64 m（成貓腳本 DOWN_HEIGHT＝0.32×2），前緣在成貓前腳後方", () => {
    expect(CABINET_ADULT.position[1] + CABINET_ADULT.size[1] / 2).toBeCloseTo(0.64);
    // 成貓起跳點往後 0.26 m，前腳掌在 root 前方約 0.18 m → glTF z ≈ -0.10；櫃子前緣要在它後面
    const edge = CABINET_ADULT.position[2] + CABINET_ADULT.size[2] / 2;
    expect(edge).toBeLessThan(-0.06);
    expect(edge).toBeGreaterThan(-0.1);
  });
});
