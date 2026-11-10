import { MAP_SIZE, mapPoint, regionSpec, type RegionId } from "@/lib/adopt-map";
import { countyLabelSize, countyLabelText, finalizeCountyLabel, pickCountyLabel, type LabelPoly } from "@/lib/geo/county-label";
import { COUNTIES, countiesIn, districtsIn, type Polygon, type Ring } from "@/lib/geo/region-bounds";

export type CountyLabel = { name: string; text: string; x: number; y: number; scale: number };

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
    return { name: county.n, text: countyLabelText(county.n), ...finalizeCountyLabel(county.n, auto, options, named) };
  });
  cache.set(region, labels);
  return labels;
}

/** 縣市名字的上緣。收攏按鈕的底邊對齊這裡，再由樣式整顆抬到字的上方。 */
export function aboveCountyLabel(label: { x: number; y: number; scale: number }) {
  return { x: label.x, y: label.y - 11 * label.scale };
}
