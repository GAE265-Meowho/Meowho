// 縣市與鄉鎮市區界。由 scripts/build-region-bounds.mjs 從 taiwan-atlas 產生。
// 只含名稱與邊界，沒有路名或門牌。
import raw from "./region-bounds.json";

export type LngLat = [number, number];
export type Ring = LngLat[];
export type Polygon = Ring[];

export interface CountyShape {
  n: string;
  l: LngLat;
  p: Polygon[];
}

export interface DistrictShape {
  c: string;
  n: string;
  l: LngLat;
  p: Polygon[];
}

export const COUNTIES = raw.counties as CountyShape[];
export const DISTRICTS = raw.districts as DistrictShape[];

/** 相鄰縣市用不同暖色，看起來像插畫分區，不是同一塊淡色。 */
export const COUNTY_TONE: Record<string, number> = {
  台北市: 0, 新北市: 1, 基隆市: 2, 桃園市: 3, 新竹市: 4, 新竹縣: 5, 宜蘭縣: 2,
  苗栗縣: 4, 台中市: 1, 彰化縣: 3, 南投縣: 5, 雲林縣: 0,
  嘉義市: 2, 嘉義縣: 4, 台南市: 1, 高雄市: 3, 屏東縣: 5,
  花蓮縣: 1, 台東縣: 4,
  澎湖縣: 0, 金門縣: 3, 連江縣: 5,
};

function insideRing(lng: number, lat: number, ring: Ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const cross = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (cross) hit = !hit;
  }
  return hit;
}

export function findDistrict(lng: number, lat: number): DistrictShape | null {
  for (const town of DISTRICTS) {
    const hit = town.p.some((poly) => insideRing(lng, lat, poly[0]) && poly.slice(1).every((hole) => !insideRing(lng, lat, hole)));
    if (hit) return town;
  }
  return null;
}

export function containsCounty(city: string, lng: number, lat: number) {
  const county = COUNTIES.find((item) => item.n === city);
  if (!county) return false;
  return county.p.some((poly) => insideRing(lng, lat, poly[0]) && poly.slice(1).every((hole) => !insideRing(lng, lat, hole)));
}

export function countiesIn(cities: readonly string[]) {
  return COUNTIES.filter((item) => cities.includes(item.n));
}

export function districtsIn(cities: readonly string[]) {
  return DISTRICTS.filter((item) => cities.includes(item.c));
}

/** 地圖落點用界線資料裡的代表點，和畫面上的行政區名稱同一處。 */
export function shapeAnchor(city: string, district = ""): { lat: number; lng: number } | null {
  if (district) {
    const town = DISTRICTS.find((item) => item.c === city && item.n === district);
    if (town) return { lng: town.l[0], lat: town.l[1] };
  }
  const county = COUNTIES.find((item) => item.n === city);
  return county ? { lng: county.l[0], lat: county.l[1] } : null;
}
