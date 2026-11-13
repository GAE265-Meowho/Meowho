import { describe, expect, it } from "vitest";
import { lightFor } from "./scene-light";
import { showVet, TABLE_TOP, VET_COLORS, VET_PARTS, vetLight } from "./vet-room";

describe("診間（看獸醫時的場景）", () => {
  it("只有劇情節點裡 bg＝vet 才換成診間；在家的時光、開場、報告都是自己家", () => {
    expect(showVet({ step: "node", bg: "vet", home: false })).toBe(true);
    expect(showVet({ step: "node", bg: "room", home: false })).toBe(false);
    expect(showVet({ step: "node", bg: "vet", home: true })).toBe(false);
    expect(showVet({ step: "place", bg: "vet", home: false })).toBe(false);
    expect(showVet({ step: "report", bg: "vet", home: false })).toBe(false);
  });

  it("手機要輕：零件在幾十個以內，顏色都來自集中的色票", () => {
    expect(VET_PARTS.length).toBeGreaterThan(5);
    expect(VET_PARTS.length).toBeLessThanOrEqual(30);
    const palette = new Set(Object.values(VET_COLORS));
    for (const p of VET_PARTS) expect(palette.has(p.color)).toBe(true);
    expect(new Set(VET_PARTS.map(p => p.id)).size).toBe(VET_PARTS.length);
  });

  it("有診療台，貓站的高度＝檯面頂端", () => {
    const top = VET_PARTS.find(p => p.id === "table-top");
    expect(top).toBeTruthy();
    expect(TABLE_TOP.y).toBeCloseTo(top!.pos[1] + top!.size[1] / 2);
    expect(TABLE_TOP.x).toBe(top!.pos[0]);
    expect(TABLE_TOP.z).toBe(top!.pos[2]);
  });

  it("吃白天／夜晚光：夜晚比白天暗，貓仍有補光", () => {
    const d = vetLight(lightFor("day").house), n = vetLight(lightFor("night").house);
    expect(n.hemi.intensity).toBeLessThan(d.hemi.intensity);
    expect(n.sun.intensity).toBeLessThan(d.sun.intensity);
    expect(n.catLight).toBeGreaterThan(0);
    expect(d.catLight).toBe(0);
    // 沒傳光＝白天
    expect(vetLight(null)).toEqual(d);
  });
});
