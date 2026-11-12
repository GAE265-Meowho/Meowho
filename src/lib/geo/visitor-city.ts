// 依上網位置（IP 的縣市或經緯度）選初始中心。不要求 GPS。
import { CITY_POINTS } from "@/lib/adopt-map";
import { findDistrict } from "@/lib/geo/region-bounds";

const ENGLISH: [string, string][] = [
  ["new taipei", "新北市"],
  ["hsinchu county", "新竹縣"],
  ["chiayi county", "嘉義縣"],
  ["chiayi city", "嘉義市"],
  ["taipei", "台北市"],
  ["keelung", "基隆市"],
  ["taoyuan", "桃園市"],
  ["hsinchu", "新竹市"],
  ["yilan", "宜蘭縣"],
  ["ilan", "宜蘭縣"],
  ["miaoli", "苗栗縣"],
  ["taichung", "台中市"],
  ["changhua", "彰化縣"],
  ["nantou", "南投縣"],
  ["yunlin", "雲林縣"],
  ["chiayi", "嘉義市"],
  ["tainan", "台南市"],
  ["kaohsiung", "高雄市"],
  ["pingtung", "屏東縣"],
  ["hualien", "花蓮縣"],
  ["taitung", "台東縣"],
  ["penghu", "澎湖縣"],
  ["kinmen", "金門縣"],
  ["lienchiang", "連江縣"],
  ["matsu", "連江縣"],
];

/** 離 22 個縣市代表點最近的一個。離台灣太遠就回傳空。 */
export function nearestCounty(lat: number, lng: number): string | null {
  let best: { name: string; distance: number } | null = null;
  for (const [name, point] of Object.entries(CITY_POINTS)) {
    const distance = (point.lat - lat) ** 2 + (point.lng - lng) ** 2;
    if (!best || distance < best.distance) best = { name, distance };
  }
  if (!best || best.distance > 4) return null;
  return best.name;
}

export function countyFromGeo(input: { city?: string | null; lat?: number | null; lng?: number | null }): string | null {
  return placeFromGeo(input).city;
}

/** 有經緯度時對到所在行政區，地圖先呈現那一區的喵戶。 */
export function placeFromGeo(input: { city?: string | null; lat?: number | null; lng?: number | null }): { city: string | null; district: string | null } {
  const lat = input.lat;
  const lng = input.lng;
  if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
    const town = findDistrict(lng, lat);
    if (town) return { city: town.c, district: town.n };
    const near = nearestCounty(lat, lng);
    if (near) return { city: near, district: null };
  }
  const raw = decodeURIComponent(input.city ?? "").trim().toLowerCase();
  if (!raw) return { city: null, district: null };
  const named = ENGLISH.find(([english]) => raw.includes(english));
  return { city: named?.[1] ?? null, district: null };
}
