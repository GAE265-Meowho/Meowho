// 喵戶小區（Issue #44）：等角座標、繪製順序、公開位置只到「區」
import { describe, expect, it } from "vitest";
import { COMMUNITY_HOUSES, ROOF_LEGEND, isoProject, paintOrder, publicLocation, roofCounts, tagWidth } from "./community";

describe("等角座標", () => {
  it("原點在中心；往 col 增加向右下、往 row 增加向左下", () => {
    const o = isoProject(0, 0), c = isoProject(1, 0), r = isoProject(0, 1);
    expect(c.x).toBeGreaterThan(o.x); expect(c.y).toBeGreaterThan(o.y);
    expect(r.x).toBeLessThan(o.x); expect(r.y).toBeGreaterThan(o.y);
    expect(c.x - o.x).toBe(o.x - r.x);
  });
  it("2:1 等角比例", () => {
    const o = isoProject(0, 0), c = isoProject(1, 0);
    expect((c.x - o.x) / (c.y - o.y)).toBe(2);
  });
});

describe("繪製順序（後面的房子先畫）", () => {
  it("依 col+row 由小到大，不改動原陣列", () => {
    const copy = [...COMMUNITY_HOUSES];
    const sums = paintOrder(COMMUNITY_HOUSES).map(h => h.col + h.row);
    expect(sums).toEqual([...sums].sort((a, b) => a - b));
    expect(COMMUNITY_HOUSES).toEqual(copy);
  });
});

describe("隱私：位置只到縣市＋區", () => {
  it("公開位置是「縣市＋區」", () => {
    expect(publicLocation({ city: "台中市", district: "北屯區" })).toBe("台中市北屯區");
  });
  it("示意資料沒有路名門牌", () => {
    for (const h of COMMUNITY_HOUSES) expect(`${h.name}${h.intro}${publicLocation(h)}`).not.toMatch(/[路街巷弄]\s*\d|\d+\s*號/);
  });
});

describe("示意資料與圖例", () => {
  it("三種屋頂都有房子，且共 9 間左右", () => {
    const n = roofCounts(COMMUNITY_HOUSES);
    expect(n.waiting).toBeGreaterThan(0); expect(n.rescue).toBeGreaterThan(0); expect(n.normal).toBeGreaterThan(0);
    expect(n.waiting + n.rescue + n.normal).toBe(COMMUNITY_HOUSES.length);
  });
  it("圖例：黃＝有貓等新家、粉＝中途救援中、白＝一般貓戶", () => {
    expect(ROOF_LEGEND.map(l => l.label)).toEqual(["黃屋頂：有貓等新家", "粉屋頂：中途救援中", "白屋頂：一般貓戶"]);
  });
  it("房子名稱不重複，位置不重疊", () => {
    expect(new Set(COMMUNITY_HOUSES.map(h => h.id)).size).toBe(COMMUNITY_HOUSES.length);
    expect(new Set(COMMUNITY_HOUSES.map(h => `${h.col},${h.row}`)).size).toBe(COMMUNITY_HOUSES.length);
  });
  it("名牌寬度隨字數增加", () => expect(tagWidth("豆花的家")).toBeLessThan(tagWidth("北屯貓咪中途站")));
});
