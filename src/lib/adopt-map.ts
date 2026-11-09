// 帶我回家地圖（縣市＋行政區）。公開位置只到區中心，路名與門牌一律丟掉（FR-02-07）。
// 北／中／南／東照常見分區；澎湖、金門、連江不塞進東部，另外標成「離島」。
import { containsCounty } from "./geo/region-bounds";
import { TW_CITIES, TW_DISTRICTS } from "./geo/tw-districts";

export type RegionId = "north" | "central" | "south" | "east" | "islands";

export interface RegionSpec {
  id: RegionId;
  label: string;
  name: string;
  note: string;
  cities: readonly string[];
}

export const ADOPT_REGIONS: readonly RegionSpec[] = [
  { id: "north", label: "北", name: "北部", note: "", cities: ["台北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "宜蘭縣"] },
  { id: "central", label: "中", name: "中部", note: "", cities: ["苗栗縣", "台中市", "彰化縣", "南投縣", "雲林縣"] },
  { id: "south", label: "南", name: "南部", note: "", cities: ["嘉義市", "嘉義縣", "台南市", "高雄市", "屏東縣"] },
  { id: "east", label: "東", name: "東部", note: "", cities: ["花蓮縣", "台東縣"] },
  { id: "islands", label: "離島", name: "離島", note: "澎湖、金門、連江", cities: ["澎湖縣", "金門縣", "連江縣"] },
];

export type CoatKey =
  | "calico" | "tortie" | "orangeWhite" | "silverTabby" | "tabby" | "tuxedo"
  | "point" | "cream" | "white" | "gray" | "orange" | "black";

export const COAT_KEYS: readonly CoatKey[] = [
  "calico", "tortie", "orangeWhite", "silverTabby", "tabby", "tuxedo",
  "point", "cream", "white", "gray", "orange", "black",
];

export type ActionKey =
  | "sun" | "meow" | "lively" | "gentle" | "knead" | "curious"
  | "eat" | "clingy" | "shy" | "sleepy" | "idle";

export const ACTION_KEYS: readonly ActionKey[] = [
  "sun", "meow", "lively", "gentle", "knead", "curious", "eat", "clingy", "shy", "sleepy", "idle",
];

export type LandmarkKind =
  | "taipei101" | "fort" | "harbor" | "temple" | "turtle" | "reed" | "lake" | "buddha"
  | "castle" | "tower" | "beach" | "mountain" | "gorge" | "bay" | "arch" | "balloon"
  | "bridge" | "lion" | "glow";

export interface MapPoint { x: number; y: number }

const norm = (s: string) => s.replace(/臺/g, "台").trim();

export function regionOf(city: string): RegionId | null {
  const name = norm(city);
  return ADOPT_REGIONS.find((r) => r.cities.includes(name))?.id ?? null;
}

export function regionSpec(id: RegionId): RegionSpec {
  return ADOPT_REGIONS.find((r) => r.id === id)!;
}

/** 從「縣市＋區」字串取出行政區。後面的路名、門牌不保留。 */
export function parseLocation(raw: string): { city: string; district: string } | null {
  const text = norm(raw).replace(/\s+/g, "");
  const city = TW_CITIES.find((c) => text.startsWith(c));
  if (!city) return null;
  const rest = text.slice(city.length);
  const district = TW_DISTRICTS[city].find((d) => rest === d || rest.startsWith(d)) ?? "";
  return { city, district };
}

const COAT_RULES: { key: CoatKey; re: RegExp }[] = [
  { key: "calico", re: /三花|三色|calico/i },
  { key: "tortie", re: /玳瑁|tortie/i },
  { key: "orangeWhite", re: /橘白|橙白|orangewhite|orange-white/i },
  { key: "silverTabby", re: /銀虎|灰虎|silver/i },
  { key: "tabby", re: /虎斑|褐虎|tabby/i },
  { key: "tuxedo", re: /賓士|黑白|乳牛|tuxedo/i },
  { key: "point", re: /重點|布偶|暹羅|point/i },
  { key: "cream", re: /奶油|乳白|金吉拉|白棕|cream/i },
  { key: "gray", re: /灰|藍貓|gray/i },
  { key: "white", re: /白|white/i },
  { key: "orange", re: /橘|橙|orange/i },
  { key: "black", re: /黑|black/i },
];

/** 卡片上的毛色文字（含舊示意資料的英文鍵）對到精靈。認不出來用虎斑，避免空白針。 */
export function coatKey(coat: string | null | undefined): CoatKey {
  const text = (coat ?? "").trim();
  if (!text) return "tabby";
  return COAT_RULES.find((rule) => rule.re.test(text))?.key ?? "tabby";
}

// 越上面越優先：一隻貓只播一種動作，比較有畫面的嗜好先贏。
// 「輕柔」不是建檔固定標籤；若出現，以及既有的溫和、愛撒嬌、愛被抱、愛被梳毛，都用同一組輕搖。
const ACTION_RULES: { key: ActionKey; tags: readonly string[] }[] = [
  { key: "sun", tags: ["愛曬太陽"] },
  { key: "meow", tags: ["愛叫"] },
  { key: "lively", tags: ["活潑", "愛玩"] },
  { key: "gentle", tags: ["輕柔", "溫和", "愛撒嬌", "愛被抱", "愛被梳毛"] },
  { key: "knead", tags: ["愛踏踏", "愛踩踏"] },
  { key: "curious", tags: ["好奇"] },
  { key: "eat", tags: ["貪吃"] },
  { key: "clingy", tags: ["黏人", "親人", "會等門"] },
  { key: "shy", tags: ["怕生", "膽小", "慢熱", "慢熟"] },
  { key: "sleepy", tags: ["慵懶", "安靜", "獨立"] },
];

const tagHits = (tag: string, needle: string) => tag === needle || tag.startsWith(needle);

export function actionKey(tags: readonly string[]): ActionKey {
  for (const rule of ACTION_RULES) {
    if (tags.some((tag) => rule.tags.some((needle) => tagHits(tag.trim(), needle)))) return rule.key;
  }
  return "idle";
}

/** 預覽最多兩個標籤，觸發目前動作的那個排前面。 */
export function previewTags(tags: readonly string[]): string[] {
  const action = actionKey(tags);
  const rule = ACTION_RULES.find((item) => item.key === action);
  const lead = tags.find((tag) => rule?.tags.some((needle) => tagHits(tag.trim(), needle)));
  return [...(lead ? [lead] : []), ...tags.filter((tag) => tag !== lead)].slice(0, 2);
}

export function countByRegion(cities: readonly string[]): Record<RegionId, number> {
  const counts: Record<RegionId, number> = { north: 0, central: 0, south: 0, east: 0, islands: 0 };
  for (const city of cities) {
    const region = regionOf(city);
    if (region) counts[region] += 1;
  }
  return counts;
}

type Frame = {
  latMin: number; latMax: number; lngMin: number; lngMax: number;
  width: number; height: number; pad: number; originX: number; originY: number;
};

// 畫布長寬接近該區的實際南北／東西比例，陸地才不會縮成海中央的一小團。
export const MAP_SIZE: Record<RegionId, { width: number; height: number }> = {
  north: { width: 900, height: 860 },
  central: { width: 820, height: 800 },
  south: { width: 560, height: 940 },
  east: { width: 460, height: 1000 },
  islands: { width: 860, height: 520 },
};

const FRAMES: Record<Exclude<RegionId, "islands">, Frame> = {
  north: { latMin: 24.22, latMax: 25.36, lngMin: 120.78, lngMax: 122.10, ...MAP_SIZE.north, pad: 32, originX: 0, originY: 0 },
  central: { latMin: 23.36, latMax: 24.82, lngMin: 119.92, lngMax: 121.55, ...MAP_SIZE.central, pad: 32, originX: 0, originY: 0 },
  south: { latMin: 21.82, latMax: 23.72, lngMin: 119.95, lngMax: 121.12, ...MAP_SIZE.south, pad: 28, originX: 0, originY: 0 },
  east: { latMin: 21.86, latMax: 24.48, lngMin: 120.66, lngMax: 121.86, ...MAP_SIZE.east, pad: 28, originX: 0, originY: 0 },
};

interface IslandBox { label: string; latMin: number; latMax: number; lngMin: number; lngMax: number; x: number; y: number; w: number; h: number }

const ISLAND_BOX: Record<string, IslandBox> = {
  澎湖縣: { label: "澎湖", latMin: 23.14, latMax: 23.82, lngMin: 119.28, lngMax: 119.74, x: 36, y: 58, w: 250, h: 400 },
  金門縣: { label: "金門", latMin: 24.36, latMax: 24.56, lngMin: 118.12, lngMax: 118.52, x: 318, y: 150, w: 230, h: 250 },
  連江縣: { label: "馬祖・連江", latMin: 25.92, latMax: 26.42, lngMin: 119.88, lngMax: 120.55, x: 586, y: 46, w: 236, h: 420 },
};

export function islandBoxes(): { id: string; label: string; x: number; y: number; w: number; h: number }[] {
  return Object.entries(ISLAND_BOX).map(([id, b]) => ({ id, label: b.label, x: b.x, y: b.y, w: b.w, h: b.h }));
}

function projectFrame(lat: number, lng: number, f: Frame): MapPoint {
  const cos = Math.cos(((f.latMin + f.latMax) / 2) * Math.PI / 180);
  const xKm = (lng - f.lngMin) * 111.32 * cos;
  const yKm = (f.latMax - lat) * 110.57;
  const spanX = (f.lngMax - f.lngMin) * 111.32 * cos;
  const spanY = (f.latMax - f.latMin) * 110.57;
  const innerW = f.width - f.pad * 2;
  const innerH = f.height - f.pad * 2;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const ox = f.originX + f.pad + (innerW - spanX * scale) / 2;
  const oy = f.originY + f.pad + (innerH - spanY * scale) / 2;
  return { x: ox + xKm * scale, y: oy + yKm * scale };
}

export function project(region: RegionId, lat: number, lng: number, hint?: { city?: string; district?: string }): MapPoint {
  if (region === "islands") {
    const city = norm(hint?.city ?? "");
    if (city === "金門縣" && hint?.district === "烏坵鄉") return { x: 548, y: 86 };
    const box = ISLAND_BOX[city];
    if (!box) return { x: MAP_SIZE.islands.width / 2, y: MAP_SIZE.islands.height / 2 };
    return projectFrame(lat, lng, { ...box, width: box.w, height: box.h, pad: 28, originX: box.x, originY: box.y });
  }
  return projectFrame(lat, lng, FRAMES[region]);
}

/** 縣市代表點（人口較集中的一側，不是幾何中心遠到外海）。 */
const CITY_POINTS: Record<string, MapLatLng> = {
  台北市: { lat: 25.038, lng: 121.564 },
  新北市: { lat: 25.014, lng: 121.463 },
  基隆市: { lat: 25.128, lng: 121.740 },
  桃園市: { lat: 24.993, lng: 121.301 },
  新竹市: { lat: 24.804, lng: 120.972 },
  新竹縣: { lat: 24.839, lng: 121.008 },
  宜蘭縣: { lat: 24.752, lng: 121.753 },
  苗栗縣: { lat: 24.565, lng: 120.821 },
  台中市: { lat: 24.148, lng: 120.674 },
  彰化縣: { lat: 24.080, lng: 120.538 },
  南投縣: { lat: 23.910, lng: 120.685 },
  雲林縣: { lat: 23.710, lng: 120.431 },
  嘉義市: { lat: 23.480, lng: 120.449 },
  嘉義縣: { lat: 23.459, lng: 120.293 },
  台南市: { lat: 23.000, lng: 120.213 },
  高雄市: { lat: 22.627, lng: 120.301 },
  屏東縣: { lat: 22.552, lng: 120.548 },
  花蓮縣: { lat: 23.992, lng: 121.601 },
  台東縣: { lat: 22.756, lng: 121.144 },
  澎湖縣: { lat: 23.569, lng: 119.579 },
  金門縣: { lat: 24.432, lng: 118.318 },
  連江縣: { lat: 26.157, lng: 119.951 },
};

type MapLatLng = { lat: number; lng: number };

// 有把握的行政區用手繪中心，其餘在該縣市附近散開（同一區永遠同一點）。
const DISTRICT_POINTS: Record<string, MapLatLng> = {
  "台中市|中區": { lat: 24.141, lng: 120.680 },
  "台中市|東區": { lat: 24.138, lng: 120.697 },
  "台中市|南區": { lat: 24.121, lng: 120.665 },
  "台中市|西區": { lat: 24.146, lng: 120.665 },
  "台中市|北區": { lat: 24.158, lng: 120.682 },
  "台中市|西屯區": { lat: 24.183, lng: 120.640 },
  "台中市|南屯區": { lat: 24.138, lng: 120.616 },
  "台中市|北屯區": { lat: 24.183, lng: 120.707 },
  "台中市|豐原區": { lat: 24.252, lng: 120.723 },
  "台中市|東勢區": { lat: 24.259, lng: 120.828 },
  "台中市|大甲區": { lat: 24.349, lng: 120.622 },
  "台中市|清水區": { lat: 24.269, lng: 120.574 },
  "台中市|沙鹿區": { lat: 24.234, lng: 120.584 },
  "台中市|梧棲區": { lat: 24.255, lng: 120.531 },
  "台中市|后里區": { lat: 24.305, lng: 120.711 },
  "台中市|神岡區": { lat: 24.258, lng: 120.662 },
  "台中市|潭子區": { lat: 24.210, lng: 120.705 },
  "台中市|大雅區": { lat: 24.229, lng: 120.648 },
  "台中市|新社區": { lat: 24.206, lng: 120.828 },
  "台中市|石岡區": { lat: 24.275, lng: 120.780 },
  "台中市|外埔區": { lat: 24.332, lng: 120.654 },
  "台中市|大安區": { lat: 24.366, lng: 120.586 },
  "台中市|烏日區": { lat: 24.105, lng: 120.624 },
  "台中市|大肚區": { lat: 24.153, lng: 120.541 },
  "台中市|龍井區": { lat: 24.193, lng: 120.526 },
  "台中市|霧峰區": { lat: 24.061, lng: 120.700 },
  "台中市|太平區": { lat: 24.126, lng: 120.718 },
  "台中市|大里區": { lat: 24.099, lng: 120.677 },
  "台中市|和平區": { lat: 24.275, lng: 121.080 },
  "台北市|大安區": { lat: 25.026, lng: 121.543 },
  "台北市|信義區": { lat: 25.033, lng: 121.572 },
  "台北市|士林區": { lat: 25.093, lng: 121.526 },
  "台北市|萬華區": { lat: 25.032, lng: 121.497 },
  "台北市|北投區": { lat: 25.132, lng: 121.501 },
  "新北市|板橋區": { lat: 25.014, lng: 121.459 },
  "新北市|淡水區": { lat: 25.168, lng: 121.441 },
  "新北市|中和區": { lat: 24.999, lng: 121.494 },
  "高雄市|鼓山區": { lat: 22.636, lng: 120.281 },
  "高雄市|鳳山區": { lat: 22.627, lng: 120.357 },
  "台南市|東區": { lat: 22.981, lng: 120.224 },
  "台南市|安平區": { lat: 22.993, lng: 120.166 },
  "花蓮縣|花蓮市": { lat: 23.987, lng: 121.605 },
  "台東縣|台東市": { lat: 22.756, lng: 121.150 },
  "澎湖縣|馬公市": { lat: 23.569, lng: 119.579 },
  "澎湖縣|湖西鄉": { lat: 23.583, lng: 119.644 },
  "澎湖縣|白沙鄉": { lat: 23.666, lng: 119.596 },
  "澎湖縣|西嶼鄉": { lat: 23.601, lng: 119.508 },
  "澎湖縣|望安鄉": { lat: 23.357, lng: 119.503 },
  "澎湖縣|七美鄉": { lat: 23.206, lng: 119.429 },
  "金門縣|金城鎮": { lat: 24.432, lng: 118.318 },
  "金門縣|金湖鎮": { lat: 24.439, lng: 118.425 },
  "金門縣|金沙鎮": { lat: 24.489, lng: 118.418 },
  "金門縣|金寧鄉": { lat: 24.456, lng: 118.338 },
  "金門縣|烈嶼鄉": { lat: 24.431, lng: 118.238 },
  "連江縣|南竿鄉": { lat: 26.157, lng: 119.951 },
  "連江縣|北竿鄉": { lat: 26.224, lng: 119.996 },
  "連江縣|莒光鄉": { lat: 25.973, lng: 119.940 },
  "連江縣|東引鄉": { lat: 26.366, lng: 120.493 },
};

/** 真正的縣市界（region-bounds.json）。路名不會被拿來判斷。 */
export function isOnLand(_region: RegionId, lat: number, lng: number, city?: string): boolean {
  return containsCounty(norm(city ?? ""), lng, lat);
}

function ensureInside(region: Exclude<RegionId, "islands">, lat: number, lng: number, city: MapLatLng, cityName: string): MapLatLng {
  if (isOnLand(region, lat, lng, cityName)) return { lat, lng };
  let t = 0.72;
  for (let i = 0; i < 10; i++) {
    const next = { lat: city.lat + (lat - city.lat) * t, lng: city.lng + (lng - city.lng) * t };
    if (isOnLand(region, next.lat, next.lng, cityName)) return next;
    t *= 0.62;
  }
  return city;
}

const SPREAD: Record<string, number> = {
  新北市: 0.1, 桃園市: 0.07, 台南市: 0.07, 高雄市: 0.07, 屏東縣: 0.09,
  南投縣: 0.08, 花蓮縣: 0.1, 台東縣: 0.1, 宜蘭縣: 0.06, 苗栗縣: 0.06,
  彰化縣: 0.05, 雲林縣: 0.05, 嘉義縣: 0.05, 新竹縣: 0.045,
  澎湖縣: 0.08, 連江縣: 0.1, 金門縣: 0.025,
};

function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clampIsland(city: string, lat: number, lng: number): MapLatLng {
  const box = ISLAND_BOX[city];
  if (!box) return { lat, lng };
  return {
    lat: Math.min(box.latMax - 0.02, Math.max(box.latMin + 0.02, lat)),
    lng: Math.min(box.lngMax - 0.015, Math.max(box.lngMin + 0.015, lng)),
  };
}

/** 縣市中心；有行政區就用該區的點。不認得的區名（路名）停在縣市，不往外猜。 */
export function anchorOf(cityRaw: string, districtRaw = ""): MapLatLng | null {
  const city = norm(cityRaw);
  const district = districtRaw.trim();
  const origin = CITY_POINTS[city];
  if (!origin) return null;
  if (!district) return origin;
  const known = DISTRICT_POINTS[`${city}|${district}`];
  if (known) return known;
  if (!TW_DISTRICTS[city]?.includes(district)) return origin;
  const region = regionOf(city);
  const spread = SPREAD[city] ?? 0.04;
  const h = hash(`${city}|${district}`);
  const angle = ((h % 360) * Math.PI) / 180;
  const ring = 0.42 + ((h >>> 9) % 50) / 100;
  const lat = origin.lat + Math.sin(angle) * spread * ring;
  const lng = origin.lng + Math.cos(angle) * spread * ring;
  if (region === "islands") return clampIsland(city, lat, lng);
  if (!region) return origin;
  return ensureInside(region, lat, lng, origin, city);
}

const LABEL_NUDGE: Record<string, MapPoint> = {
  新竹市: { x: -36, y: 18 },
  新竹縣: { x: 28, y: -6 },
  嘉義市: { x: -34, y: 6 },
  嘉義縣: { x: 10, y: 22 },
  台北市: { x: -4, y: 20 },
  新北市: { x: -16, y: -18 },
  基隆市: { x: 14, y: -16 },
  宜蘭縣: { x: 16, y: 8 },
  桃園市: { x: 0, y: 18 },
  台中市: { x: 58, y: -18 },
  彰化縣: { x: -6, y: 18 },
  南投縣: { x: 18, y: 4 },
  苗栗縣: { x: 8, y: -14 },
  雲林縣: { x: 4, y: 16 },
  花蓮縣: { x: 22, y: 0 },
  台東縣: { x: 20, y: 6 },
  高雄市: { x: -8, y: 16 },
  台南市: { x: -6, y: 16 },
  屏東縣: { x: 16, y: 4 },
};

function shortCity(name: string) {
  if (name === "新竹市" || name === "新竹縣" || name === "嘉義市" || name === "嘉義縣") return name;
  return name.replace(/[市縣]$/, "");
}

export function cityDots(region: RegionId): { name: string; x: number; y: number }[] {
  if (region === "islands") return [];
  return regionSpec(region).cities.map((city) => {
    const at = CITY_POINTS[city];
    const p = project(region, at.lat, at.lng);
    const nudge = LABEL_NUDGE[city] ?? { x: 0, y: 16 };
    return { name: shortCity(city), x: p.x + nudge.x, y: p.y + nudge.y };
  });
}

export interface Landmark {
  id: string;
  region: RegionId;
  name: string;
  kind: LandmarkKind;
  lat: number;
  lng: number;
  city?: string;
}

export const LANDMARKS: readonly Landmark[] = [
  { id: "101", region: "north", name: "台北101", kind: "taipei101", lat: 25.034, lng: 121.565 },
  { id: "tamsui", region: "north", name: "淡水", kind: "fort", lat: 25.172, lng: 121.438 },
  { id: "keelung", region: "north", name: "基隆港", kind: "harbor", lat: 25.142, lng: 121.768 },
  { id: "hsinchu", region: "north", name: "城隍廟", kind: "temple", lat: 24.804, lng: 120.964 },
  { id: "turtle", region: "north", name: "龜山島", kind: "turtle", lat: 24.842, lng: 121.952 },
  { id: "gaomei", region: "central", name: "高美濕地", kind: "reed", lat: 24.312, lng: 120.549 },
  { id: "sunmoon", region: "central", name: "日月潭", kind: "lake", lat: 23.857, lng: 120.915 },
  { id: "bagua", region: "central", name: "八卦山", kind: "buddha", lat: 24.045, lng: 120.612 },
  { id: "beigang", region: "central", name: "北港", kind: "temple", lat: 23.568, lng: 120.304 },
  { id: "anping", region: "south", name: "安平古堡", kind: "castle", lat: 23.001, lng: 120.161 },
  { id: "tower85", region: "south", name: "高雄港", kind: "tower", lat: 22.620, lng: 120.285 },
  { id: "kenting", region: "south", name: "墾丁", kind: "beach", lat: 21.948, lng: 120.798 },
  { id: "alishan", region: "south", name: "阿里山", kind: "mountain", lat: 23.508, lng: 120.803 },
  { id: "taroko", region: "east", name: "太魯閣", kind: "gorge", lat: 24.158, lng: 121.492 },
  { id: "qixing", region: "east", name: "七星潭", kind: "bay", lat: 23.995, lng: 121.628 },
  { id: "sanxian", region: "east", name: "三仙台", kind: "arch", lat: 23.124, lng: 121.414 },
  { id: "balloon", region: "east", name: "鹿野", kind: "balloon", lat: 22.912, lng: 121.128 },
  { id: "bridge", region: "islands", name: "跨海大橋", kind: "bridge", lat: 23.642, lng: 119.596, city: "澎湖縣" },
  { id: "lion", region: "islands", name: "風獅爺", kind: "lion", lat: 24.449, lng: 118.318, city: "金門縣" },
  { id: "tears", region: "islands", name: "藍眼淚", kind: "glow", lat: 26.160, lng: 119.950, city: "連江縣" },
];

export function landmarkDots(region: RegionId): (Landmark & MapPoint)[] {
  return LANDMARKS.filter((mark) => mark.region === region).map((mark) => ({
    ...mark,
    ...project(region, mark.lat, mark.lng, { city: mark.city }),
  }));
}

/** 同一縣市的行政區在全區比例下會擠在一起；沿原方向拉開，北仍在北、西仍在西。 */
function loosenDistricts<T extends { city: string; x: number; y: number }>(spots: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const spot of spots) {
    const list = groups.get(spot.city) ?? [];
    list.push(spot);
    groups.set(spot.city, list);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const cx = group.reduce((sum, spot) => sum + spot.x, 0) / group.length;
    const cy = group.reduce((sum, spot) => sum + spot.y, 0) / group.length;
    let nearest = Infinity;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        nearest = Math.min(nearest, Math.hypot(group[i].x - group[j].x, group[i].y - group[j].y));
      }
    }
    if (!Number.isFinite(nearest) || nearest === 0 || nearest >= 54) continue;
    const scale = Math.min(2.6, 54 / nearest);
    for (const spot of group) {
      spot.x = cx + (spot.x - cx) * scale;
      spot.y = cy + (spot.y - cy) * scale;
    }
  }
  return spots;
}

function fan(index: number, total: number) {
  if (total <= 1) return { dx: 0, dy: 0 };
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / total;
  const radius = total > 5 ? 22 : 16;
  return { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius * 0.75 };
}

/** 把貓放到所選區域。沒有公開縣市、或不在這個區域的，不放上地圖。 */
export function placeCats<T extends { id: string; city: string; district: string }>(
  cats: readonly T[],
  region: RegionId,
): (T & MapPoint)[] {
  const groups = new Map<string, T[]>();
  for (const cat of cats) {
    if (regionOf(cat.city) !== region || !anchorOf(cat.city, cat.district)) continue;
    const key = `${norm(cat.city)}|${cat.district.trim()}`;
    const list = groups.get(key);
    if (list) list.push(cat);
    else groups.set(key, [cat]);
  }
  const placed: (T & MapPoint)[] = [];
  for (const group of groups.values()) {
    group.forEach((cat, index) => {
      const anchor = anchorOf(cat.city, cat.district)!;
      const p = project(region, anchor.lat, anchor.lng, { city: cat.city, district: cat.district });
      const offset = fan(index, group.length);
      placed.push({ ...cat, x: p.x + offset.dx, y: p.y + offset.dy });
    });
  }
  return loosenDistricts(placed);
}
