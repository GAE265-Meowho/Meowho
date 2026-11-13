import { describe, expect, it } from "vitest";
import { ADOPT_REGIONS, mapPoint } from "../adopt-map";
import { districtsIn } from "./region-bounds";
import { hideTownLabel, projectedArea, townFontSizes, fitTownLabel, labelsOverlap, nationalNameLabels, settleLabels, type SettledLabel, type TownSpot } from "./town-label";

function overlaps(a: TownSpot, b: TownSpot, sizeA: number, sizeB: number) {
  const width = (a.text.length * sizeA + b.text.length * sizeB) / 2;
  return Math.abs(a.x - b.x) < width - 0.5 && Math.abs(a.y - b.y) < Math.max(sizeA, sizeB) * 0.85;
}

describe("行政區名稱", () => {
  it("嘉義市不標東區、西區", () => {
    expect(hideTownLabel("嘉義市", "東區")).toBe(true);
    expect(hideTownLabel("嘉義市", "西區")).toBe(true);
    expect(hideTownLabel("台南市", "東區")).toBe(false);
    expect(hideTownLabel("嘉義縣", "太保市")).toBe(false);
  });

  it("沒有重疊就維持原字級", () => {
    const towns: TownSpot[] = [
      { text: "大安", x: 0, y: 0, area: 400 },
      { text: "信義", x: 80, y: 0, area: 80 },
    ];
    expect(townFontSizes(towns)).toEqual([12, 12]);
  });

  it("重疊時面積較小的字比較小", () => {
    const towns: TownSpot[] = [
      { text: "鹽埕", x: 0, y: 0, area: 30 },
      { text: "鼓山", x: 14, y: 0, area: 400 },
    ];
    const [small, large] = townFontSizes(towns);
    expect(small).toBeLessThan(large);
    expect(small).toBeGreaterThanOrEqual(5);
    expect(large).toBeLessThanOrEqual(12);
  });

  it("三個名字擠在一起時，比只碰到一個的更小", () => {
    const pile: TownSpot[] = [
      { text: "甲", x: 0, y: 0, area: 500 },
      { text: "乙", x: 6, y: 1, area: 500 },
      { text: "丙", x: 3, y: 6, area: 500 },
    ];
    const loose: TownSpot[] = [
      { text: "甲", x: 0, y: 0, area: 500 },
      { text: "乙", x: 10, y: 0, area: 500 },
    ];
    const pileSize = Math.max(...townFontSizes(pile));
    const looseSize = Math.min(...townFontSizes(loose));
    expect(pileSize).toBeLessThan(looseSize);
    expect(pileSize).toBeLessThanOrEqual(8);
  });

  it("台北、基隆、台南、高雄重疊的區名依面積縮小", () => {
    for (const city of ["台北市", "基隆市", "台南市", "高雄市", "屏東縣"]) {
      const region = ADOPT_REGIONS.find((item) => item.cities.includes(city))!;
      const towns: TownSpot[] = districtsIn([city]).map((district) => ({
        text: district.n.replace(/(區|鄉|鎮|市)$/, ""),
        ...mapPoint(region.id, district.l[1], district.l[0], district.c),
        area: projectedArea(district.p.map((poly) => poly.map((ring) => ring.map(([lng, lat]) => mapPoint(region.id, lat, lng, district.c))))),
      }));
      const sizes = townFontSizes(towns);
      expect(sizes.some((size) => size < 12), city).toBe(true);
      towns.forEach((town, index) => {
        const crowd = towns.filter((other) => other !== town && overlaps(town, other, 12, 12)).length;
        if (crowd >= 2) expect(sizes[index], `${city} ${town.text}`).toBeLessThanOrEqual(8);
      });
    }
  });

  it("較高的行政區直排，較寬的橫排，字都放得進外框", () => {
    const tall = fitTownLabel("和平", 20, 80);
    expect(tall.vertical).toBe(true);
    expect(tall.size * 2).toBeLessThanOrEqual(80 * 0.7 + 0.01);
    expect(tall.size).toBeLessThanOrEqual(20 * 0.7 + 0.01);
    const wide = fitTownLabel("北屯", 80, 18);
    expect(wide.vertical).toBe(false);
    expect(wide.size * 2).toBeLessThanOrEqual(80 * 0.7 + 0.01);
    expect(wide.size).toBeLessThanOrEqual(18 * 0.7 + 0.01);
    expect(fitTownLabel("西", 12, 12).size).toBeLessThan(fitTownLabel("西", 48, 48).size);
  });

  it("疊在一起的區名會錯開", () => {
    const west: SettledLabel = {
      key: "西屯", role: "town", text: "西屯", x: 0, y: 0, vertical: false, size: 12, cap: 12, tracking: 0, stretch: 0.8,
      bounds: { minX: -40, minY: -24, maxX: 28, maxY: 24 },
    };
    const north: SettledLabel = {
      key: "北區", role: "town", text: "北區", x: 10, y: 1, vertical: false, size: 12, cap: 12, tracking: 0, stretch: 1,
      bounds: { minX: -8, minY: -16, maxX: 28, maxY: 18 },
    };
    const [a, b] = settleLabels([west, north]);
    expect(labelsOverlap(a, b)).toBe(false);
    expect(a.size).toBeLessThanOrEqual(a.cap);
    expect(b.size).toBeLessThanOrEqual(b.cap);
  });

  it("全島行政區名與縣市名錯開，直向的區維持直排", () => {
    const { towns, counties } = nationalNameLabels();
    const all = [...towns, ...counties];
    const hits: string[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (labelsOverlap(all[i], all[j])) hits.push(`${all[i].role}:${all[i].text}/${all[j].role}:${all[j].text}`);
      }
    }
    expect(hits, hits.slice(0, 8).join("、")).toEqual([]);
    const heping = towns.find((town) => town.key === "花蓮縣-秀林鄉");
    expect(heping?.vertical).toBe(true);
    for (const town of towns) {
      if (!town.bounds) continue;
      const ink = {
        left: town.x - (town.vertical ? town.size : [...town.text].length * town.size) / 2,
        right: town.x + (town.vertical ? town.size : [...town.text].length * town.size) / 2,
      };
      expect(ink.left, town.key).toBeGreaterThanOrEqual(town.bounds.minX - 1);
      expect(ink.right, town.key).toBeLessThanOrEqual(town.bounds.maxX + 1);
    }
  });
});
