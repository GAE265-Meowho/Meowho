import { describe, expect, it } from "vitest";
import { ADOPT_REGIONS, MAP_SIZE, mapPoint } from "../adopt-map";
import { COUNTIES, DISTRICTS, countiesIn, districtsIn, type Polygon } from "./region-bounds";
import { taiwanCountyLabels } from "./county-labels";
import { countyLabelSize, edgeClearance, finalizeCountyLabel, insideCounties, largestPolygon, pickCountyLabel, type LabelPoly } from "./county-label";
import { projectTaiwan } from "../adopt-map";

function square(x: number, y: number, w: number, h: number): LabelPoly {
  return [[{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]];
}

function projectPolys(region: (typeof ADOPT_REGIONS)[number]["id"], city: string, polys: Polygon[]): LabelPoly[] {
  return polys
    .map((poly) => poly.map((ring) => ring.map(([lng, lat]) => mapPoint(region, lat, lng, city))).filter((ring) => ring.length >= 3))
    .filter((poly) => (poly[0]?.length ?? 0) >= 3);
}

describe("縣市名位置", () => {  it("靠海的縣市名貼在自己的海上，不放進隔壁縣市", () => {
    const at = pickCountyLabel({
      own: [square(40, 40, 80, 80)],
      foreign: [square(140, 40, 80, 80)],
      towns: [{ x: 80, y: 80 }],
      width: 320,
      height: 200,
      hw: 20,
      hh: 10,
    });
    expect(insideCounties(at.x, at.y, [square(40, 40, 80, 80)])).toBe(false);
    expect(insideCounties(at.x, at.y, [square(140, 40, 80, 80)])).toBe(false);
    expect(Math.hypot(at.x - 80, at.y - 80)).toBeLessThan(Math.hypot(at.x - 180, at.y - 80));
  });

  it("被包住的縣市名留在自己境內，不寫到外圍縣市", () => {
    const inner = square(80, 80, 50, 50);
    const outer: LabelPoly = [[
      { x: 0, y: 0 }, { x: 220, y: 0 }, { x: 220, y: 220 }, { x: 0, y: 220 },
    ], inner[0]];
    const at = pickCountyLabel({
      own: [inner],
      foreign: [outer],
      towns: [{ x: 105, y: 105 }],
      width: 240,
      height: 240,
      hw: 12,
      hh: 8,
    });
    expect(insideCounties(at.x, at.y, [inner])).toBe(true);
    expect(insideCounties(at.x, at.y, [outer])).toBe(false);
  });

  it("每個縣市名的方框都不落在其他縣市裡", () => {
    for (const region of ADOPT_REGIONS) {
      const counties = countiesIn(region.cities);
      const towns = districtsIn(region.cities);
      const size = MAP_SIZE[region.id];
      const projected = counties.map((county) => ({
        name: county.n,
        polys: projectPolys(region.id, county.n, county.p),
      }));
      const placed: { name: string; x: number; y: number }[] = [];
      for (const county of projected) {
        const island = region.id === "islands";
        const foreignNames = COUNTIES.filter((item) => item.n !== county.name && (island ? region.cities.includes(item.n) : !["澎湖縣", "金門縣", "連江縣"].includes(item.n)));
        const foreign = foreignNames.flatMap((item) => projectPolys(region.id, item.n, item.p));
        const named = towns.filter((town) => town.c === county.name).map((town) => ({ name: town.n, ...mapPoint(region.id, town.l[1], town.l[0], town.c) }));
        const { hw, hh } = countyLabelSize(county.name);
        const options = { own: county.polys, foreign, towns: named, width: size.width, height: size.height, hw, hh };
        const auto = pickCountyLabel(options);
        const at = finalizeCountyLabel(county.name, auto, options, named);
        const guarded = county.name === "屏東縣"
          ? foreignNames.filter((item) => item.n !== "台東縣").flatMap((item) => projectPolys(region.id, item.n, item.p))
          : foreign;
        const box = [
          at,
          { x: at.x - hw * at.scale, y: at.y }, { x: at.x + hw * at.scale, y: at.y },
          { x: at.x, y: at.y - hh * at.scale }, { x: at.x, y: at.y + hh * at.scale },
        ];
        for (const spot of box) {
          expect(insideCounties(spot.x, spot.y, guarded), `${region.label} ${county.name}`).toBe(false);
        }
        if (county.name === "新竹縣") {
          expect(at.x).toBeLessThan(auto.x);
          expect(at.y).toBeGreaterThan(auto.y);
          expect(edgeClearance(at.x, at.y, county.polys)).toBeLessThan(edgeClearance(auto.x, auto.y, county.polys));
        }
        if (county.name === "台中市") {
          expect(at.x).toBeGreaterThan(auto.x);
          expect(at.y).toBeLessThan(auto.y);
          expect(edgeClearance(at.x, at.y, county.polys)).toBeLessThan(edgeClearance(auto.x, auto.y, county.polys));
        }
        if (county.name === "屏東縣") {
          const taiwu = named.find((town) => town.name === "泰武鄉");
          expect(taiwu).toBeTruthy();
          expect(at.x).toBeGreaterThan((taiwu?.x ?? 0) + 36);
          expect(at.y).toBeCloseTo(taiwu?.y ?? 0, 0);
        }
        if (county.name === "台北市" || county.name === "南投縣" || county.name === "嘉義市") {
          expect(insideCounties(at.x, at.y, county.polys), county.name).toBe(true);
        }
        if (county.name === "基隆市" || county.name === "花蓮縣" || county.name === "澎湖縣" || county.name === "台中市") {
          expect(insideCounties(at.x, at.y, county.polys), county.name).toBe(false);
        }
        placed.push({ name: county.name, x: at.x, y: at.y });
      }
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const gap = Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y);
          expect(gap, `${placed[i].name} 與 ${placed[j].name}`).toBeGreaterThan(70);
        }
      }
    }
    expect(DISTRICTS.length).toBeGreaterThan(300);
  });

  it("全島縣市名貼在鄰近外海，台北與南投留在境內，不標新竹市與嘉義市", () => {
    const labels = taiwanCountyLabels();
    const names = labels.map((label) => label.name);
    expect(names).not.toContain("新竹市");
    expect(names).not.toContain("嘉義市");
    expect(names).toContain("新竹縣");
    expect(names).toContain("嘉義縣");
    const polys = new Map(COUNTIES.map((county) => [county.n, county.p.map((poly) => poly.map((ring) => ring.map(([lng, lat]) => projectTaiwan(lat, lng))))]));
    for (const label of labels) {
      const own = polys.get(label.name) ?? [];
      const foreign = [...polys.entries()].filter(([name]) => name !== label.name).flatMap(([, poly]) => poly);
      if (label.name === "台北市" || label.name === "南投縣") {
        expect(insideCounties(label.x, label.y, own), label.name).toBe(true);
      } else {
        expect(insideCounties(label.x, label.y, own), label.name).toBe(false);
        expect(insideCounties(label.x, label.y, foreign), label.name).toBe(false);
        expect(edgeClearance(label.x, label.y, own), label.name).toBeLessThan(160);
      }
      if (label.name === "澎湖縣" || label.name === "南投縣") {
        expect(label.arrow, label.name).toBeNull();
      } else {
        expect(label.arrow, label.name).toBeTruthy();
        expect(edgeClearance(label.arrow?.x2 ?? 0, label.arrow?.y2 ?? 0, own), label.name).toBeLessThan(2);
      }
      if (label.name === "台中市" || label.name === "嘉義縣") {
        const ring = (own.find((poly) => (poly[0]?.length ?? 0) > 10)?.[0] ?? []);
        const ys = ring.map((point) => point.y);
        const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
        const span = Math.max(...ys) - Math.min(...ys);
        expect(Math.abs((label.arrow?.y2 ?? 0) - mid), label.name).toBeLessThan(span * 0.3);
      }
    }
    const green = DISTRICTS.find((town) => town.c === "台東縣" && town.n === "綠島鄉");
    const island = projectTaiwan(green?.l[1] ?? 0, green?.l[0] ?? 0);
    const taitung = labels.find((label) => label.name === "台東縣");
    expect(taitung && taitung.x).toBeLessThan(island.x);
    expect(taitung && taitung.y).toBeGreaterThan(island.y);
    const taitungOwn = polys.get("台東縣") ?? [];
    const mainland = largestPolygon(taitungOwn);
    const offshore = taitungOwn.filter((poly) => poly !== mainland[0]);
    expect(edgeClearance(taitung?.arrow?.x2 ?? 0, taitung?.arrow?.y2 ?? 0, mainland)).toBeLessThan(2);
    expect(edgeClearance(taitung?.arrow?.x2 ?? 0, taitung?.arrow?.y2 ?? 0, offshore)).toBeGreaterThan(30);
  });
});
