import { MAP_SIZE, mapPoint, projectTaiwan, regionSpec, TAIWAN_MAP, type RegionId } from "@/lib/adopt-map";
import { countyLabelSize, countyLabelText, finalizeCountyLabel, insideCounties, largestPolygon, nearestRingPoint, pickCountyLabel, westCoastMiddle, type LabelPoly } from "@/lib/geo/county-label";
import { COUNTIES, DISTRICTS, countiesIn, districtsIn, type Polygon, type Ring } from "@/lib/geo/region-bounds";

export type CountyLabel = {
  name: string;
  text: string;
  x: number;
  y: number;
  scale: number;
  /** 從縣市名外緣拉到該縣市地圖外緣。太短就不畫。 */
  arrow: { x1: number; y1: number; x2: number; y2: number } | null;
};

function ringPoints(region: RegionId, ring: Ring, city: string) {
  return ring.map(([lng, lat]) => mapPoint(region, lat, lng, city));
}

function projectPolys(region: RegionId, city: string, polys: Polygon[]): LabelPoly[] {
  return polys
    .map((poly) => poly.map((ring) => ringPoints(region, ring, city)).filter((ring) => ring.length >= 3))
    .filter((poly) => (poly[0]?.length ?? 0) >= 3);
}

const cache = new Map<RegionId, CountyLabel[]>();

/** 跟地圖上縣市名同一套落點。 */
export function countyLabels(region: RegionId): CountyLabel[] {
  const hit = cache.get(region);
  if (hit) return hit;
  const size = MAP_SIZE[region];
  const names = regionSpec(region).cities;
  const here = countiesIn(names);
  const towns = districtsIn(names);
  const labels = here.map((county) => {
    const own = projectPolys(region, county.n, county.p);
    const foreignNames = region === "islands"
      ? here.filter((item) => item.n !== county.n)
      : COUNTIES.filter((item) => item.n !== county.n && !["澎湖縣", "金門縣", "連江縣"].includes(item.n));
    const foreign = foreignNames.flatMap((item) => projectPolys(region, item.n, item.p));
    const named = towns.filter((town) => town.c === county.n).map((town) => ({ name: town.n, ...mapPoint(region, town.l[1], town.l[0], town.c) }));
    const { hw, hh } = countyLabelSize(county.n);
    const options = { own, foreign, towns: named, width: size.width, height: size.height, hw, hh };
    const auto = pickCountyLabel(options);
    return { name: county.n, text: countyLabelText(county.n), ...finalizeCountyLabel(county.n, auto, options, named), arrow: null };
  });
  cache.set(region, labels);
  return labels;
}

const HIDDEN_COUNTY_NAME = new Set(["新竹市", "嘉義市"]);
// 南投縣沒有外海。畫面上的「南投」留在境內，對應使用者說的南投市。
const INLAND_COUNTY_NAME = new Set(["台北市", "南投縣"]);
const NO_ARROW = new Set(["澎湖縣", "南投縣"]);

let taiwanCache: CountyLabel[] | null = null;

function projectTaiwanPolys(polys: Polygon[]): LabelPoly[] {
  return polys
    .map((poly) => poly.map((ring) => ring.map(([lng, lat]) => projectTaiwan(lat, lng))).filter((ring) => ring.length >= 3))
    .filter((poly) => (poly[0]?.length ?? 0) >= 3);
}

/** 全島地圖的縣市名。新竹市、嘉義市不標；台北、南投留在境內，其餘貼在自己的外海。 */
export function taiwanCountyLabels(): CountyLabel[] {
  if (taiwanCache) return taiwanCache;
  const projected = COUNTIES.map((county) => ({ name: county.n, polys: projectTaiwanPolys(county.p) }));
  const labels = COUNTIES.flatMap((county) => {
    if (HIDDEN_COUNTY_NAME.has(county.n)) return [];
    const own = projected.find((item) => item.name === county.n)?.polys ?? [];
    const foreign = projected.filter((item) => item.name !== county.n).flatMap((item) => item.polys);
    const towns = DISTRICTS.filter((town) => town.c === county.n).map((town) => projectTaiwan(town.l[1], town.l[0]));
    const { hw, hh } = countyLabelSize(county.n);
    const inland = INLAND_COUNTY_NAME.has(county.n);
    const at = pickCountyLabel(
      { own, foreign, towns, width: TAIWAN_MAP.width, height: TAIWAN_MAP.height, hw, hh },
      inland ? "inland" : "sea",
    );
    let placed = at;
    if (county.n === "台東縣") {
      const green = DISTRICTS.find((town) => town.c === "台東縣" && town.n === "綠島鄉");
      if (green) {
        const island = projectTaiwan(green.l[1], green.l[0]);
        let spot = { x: island.x - 28, y: island.y + 24 };
        for (const dy of [24, 36, 48]) {
          for (const dx of [28, 40, 54]) {
            const next = { x: island.x - dx, y: island.y + dy };
            if (!insideCounties(next.x, next.y, own)) {
              spot = next;
              break;
            }
          }
          if (!insideCounties(spot.x, spot.y, own)) break;
        }
        placed = { ...at, x: spot.x, y: spot.y };
      }
    }
    const coast = county.n === "台中市" || county.n === "嘉義縣" ? westCoastMiddle(own) : null;
    const shore = county.n === "台東縣" ? largestPolygon(own) : own;
    const tip = coast ?? nearestRingPoint(placed.x, placed.y, shore, inland, inland ? 0 : 28);
    const dx = tip.x - placed.x;
    const dy = tip.y - placed.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const boxExit = Math.min(
      Math.abs(ux) > 1e-4 ? (hw * placed.scale) / Math.abs(ux) : Infinity,
      Math.abs(uy) > 1e-4 ? (hh * placed.scale) / Math.abs(uy) : Infinity,
    );
    const leave = Math.min(boxExit, Math.max(0, len - 12));
    const arrow = NO_ARROW.has(county.n) || len < 4 ? null : {
      x1: placed.x + ux * leave,
      y1: placed.y + uy * leave,
      x2: tip.x,
      y2: tip.y,
    };
    return [{ name: county.n, text: countyLabelText(county.n), ...placed, arrow }];
  });
  taiwanCache = labels;
  return labels;
}

/** 縣市名字的上緣。收攏按鈕的底邊對齊這裡，再由樣式整顆抬到字的上方。 */
export function aboveCountyLabel(label: { x: number; y: number; scale: number }) {
  return { x: label.x, y: label.y - 11 * label.scale };
}
