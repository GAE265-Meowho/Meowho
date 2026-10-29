// 喵戶小區（Issue #44）：每間房子是一個貓戶。第一版用示意資料，之後換 meow_households（只取縣市＋區）。
import type { PhotoKey } from "@/lib/photos";

export type RoofKind = "waiting" | "fresh" | "normal"; // 黃＝有貓等新家｜粉＝剛重啟喵生（剛移轉到新家）｜白＝一般貓戶

export interface HouseCat { name: string; breed: string; age: string; waiting?: boolean }
export interface HouseMedia { diaries: number; photos: number; videos: number }

export interface CommunityHouse {
  id: string;
  name: string;
  city: string;
  district: string;
  owner: string; // 貓戶長（暱稱）
  kind: RoofKind;
  cats: number; // 目前照顧的貓數
  waiting: number; // 等新家的貓數
  intro: string;
  residents: HouseCat[];
  media: HouseMedia;
  photos: PhotoKey[]; // 相簿縮圖（示意）
  latest: { text: string; when: string };
  col: number; // 小鎮格座標（0～5）
  row: number;
}

export const ROOF_LEGEND: { kind: RoofKind; label: string; color: string }[] = [
  { kind: "waiting", label: "黃屋頂：有貓等新家", color: "#F2B73F" },
  { kind: "fresh", label: "粉屋頂：剛重啟喵生", color: "#E3668F" },
  { kind: "normal", label: "白屋頂：一般貓戶", color: "#FFFFFF" },
];

/** 地區預覽的分組（縣市＋區）。示意情境：新北板橋、新北中和、基隆 */
export const REGIONS: { id: string; label: string; city: string; district: string }[] = [
  { id: "banqiao", label: "新北板橋", city: "新北市", district: "板橋區" },
  { id: "zhonghe", label: "新北中和", city: "新北市", district: "中和區" },
  { id: "keelung", label: "基隆", city: "基隆市", district: "" }, // 基隆全市（含仁愛、中正等區）
];

const L = (...c: [string, string, string, boolean?][]): HouseCat[] => c.map(([name, breed, age, waiting]) => ({ name, breed, age, ...(waiting ? { waiting } : {}) }));

export const COMMUNITY_HOUSES: CommunityHouse[] = [
  // ── 新北板橋 ──
  { id: "douhua", name: "豆花的家", city: "新北市", district: "板橋區", owner: "Tina", kind: "waiting", cats: 3, waiting: 1, intro: "豆花是家貓，芝麻是剛救援來的黑貓，正在等新家。", residents: L(["豆花", "橘貓", "3 歲"], ["芝麻", "黑貓", "8 個月", true], ["湯圓", "三花", "2 歲"]), media: { diaries: 128, photos: 342, videos: 21 }, photos: ["orange", "blackBox", "calicoEat", "orangeJump"], latest: { text: "芝麻今天第一次自己走進外出籠，還在裡面睡了午覺。", when: "3 天前" }, col: 3.0, row: 0.5 },
  { id: "laomao", name: "老貓小日子", city: "新北市", district: "板橋區", owner: "Tina", kind: "normal", cats: 2, waiting: 0, intro: "兩隻 12 歲的老貓，每天曬太陽、睡午覺。", residents: L(["阿福", "虎斑", "12 歲"], ["小灰", "灰貓", "12 歲"]), media: { diaries: 64, photos: 188, videos: 9 }, photos: ["tabbyPerch", "gray", "calicoSleep", "tabby"], latest: { text: "下午的陽光剛好照在貓窩上，兩隻老貓從一點睡到五點。", when: "昨天" }, col: 4.3, row: 0.7 },
  { id: "banqiaofresh", name: "麻糬報到中", city: "新北市", district: "板橋區", owner: "Tina", kind: "fresh", cats: 1, waiting: 0, intro: "麻糬剛從中途移轉到新家第 14 天，正在熟悉新環境。", residents: L(["麻糬", "三花", "1 歲"]), media: { diaries: 14, photos: 52, videos: 3 }, photos: ["calico", "calicoSleep", "munchkin", "cream"], latest: { text: "移轉到新家的第 14 天，麻糬已經會在玄關等我下班。", when: "5 天前" }, col: 4.9, row: 1.9 },
  // ── 新北中和 ──
  { id: "zhonghe1", name: "景新窗邊三喵", city: "新北市", district: "中和區", owner: "Tina", kind: "normal", cats: 3, waiting: 0, intro: "三兄妹一起長大，最愛窗邊曬太陽。", residents: L(["小橘", "橘貓", "2 歲"], ["小白", "白貓", "2 歲"], ["小黑", "黑貓", "2 歲"]), media: { diaries: 97, photos: 260, videos: 14 }, photos: ["orangeJump", "cream", "black", "tuxedo"], latest: { text: "三隻同時擠在窗台上，誰也不讓誰。", when: "2 天前" }, col: 0.7, row: 1.3 },
  { id: "zhonghe2", name: "巷口中途屋", city: "新北市", district: "中和區", owner: "Tina", kind: "waiting", cats: 6, waiting: 4, intro: "個人中途，目前有 4 隻貓在找家，歡迎先私訊聊聊。", residents: L(["橘子", "橘貓", "2 歲", true], ["黑糖", "黑貓", "5 歲", true], ["奶茶", "三花", "9 個月", true], ["豆乾", "賓士", "1 歲", true], ["阿花", "三花", "3 歲"], ["咪咪", "米克斯", "4 歲"]), media: { diaries: 210, photos: 511, videos: 37 }, photos: ["orange", "blackBox", "calicoEat", "tuxedo"], latest: { text: "橘子今天第一次自己吃完整碗，獎勵一根肉泥。", when: "今天" }, col: 1.7, row: 2.2 },
  { id: "zhonghe3", name: "南勢角貓舍", city: "新北市", district: "中和區", owner: "Tina", kind: "fresh", cats: 2, waiting: 0, intro: "上週剛迎來兩隻從中途轉來的小貓。", residents: L(["布丁", "奶油貓", "6 個月"], ["焦糖", "橘白", "6 個月"]), media: { diaries: 9, photos: 40, videos: 2 }, photos: ["cream", "orangeJump", "munchkin", "tabby"], latest: { text: "第三天，布丁終於願意從床底下出來吃罐罐。", when: "4 天前" }, col: 2.6, row: 3.2 },
  // ── 基隆 ──
  { id: "keelung1", name: "廟口海風屋", city: "基隆市", district: "仁愛區", owner: "Tina", kind: "waiting", cats: 5, waiting: 2, intro: "港邊撿到的小貓長大了，兩隻親人的在等新家。", residents: L(["海苔", "黑白貓", "1 歲", true], ["鹽巴", "白貓", "1 歲", true], ["小鯖", "虎斑", "3 歲"], ["阿港", "橘貓", "4 歲"], ["雨雨", "灰貓", "2 歲"]), media: { diaries: 88, photos: 301, videos: 18 }, photos: ["tuxedo", "gray", "tabbyPerch", "orange"], latest: { text: "下雨天，海苔和鹽巴擠在同一個紙箱裡取暖。", when: "昨天" }, col: 3.6, row: 3.2 },
  { id: "keelung2", name: "海岸救援站", city: "基隆市", district: "中正區", owner: "Tina", kind: "fresh", cats: 4, waiting: 0, intro: "協會立案的救援站，剛有四隻貓移轉到新家的路上。", residents: L(["阿浪", "橘貓", "2 歲"], ["小潮", "賓士", "1 歲"], ["珊瑚", "三花", "3 歲"], ["貝殼", "奶油貓", "1 歲"]), media: { diaries: 156, photos: 420, videos: 26 }, photos: ["calicoEat", "cream", "black", "calico"], latest: { text: "珊瑚的結紮手術順利，今天已經能自己吃飯。", when: "3 天前" }, col: 4.6, row: 4.0 },
  { id: "keelung3", name: "雲朵貓舍", city: "基隆市", district: "七堵區", owner: "Tina", kind: "normal", cats: 1, waiting: 0, intro: "一隻布偶，個性像雲一樣軟。", residents: L(["雲朵", "布偶", "4 歲"]), media: { diaries: 41, photos: 120, videos: 6 }, photos: ["ragdoll", "cream", "calicoSleep", "gray"], latest: { text: "雲朵今天在窗邊看了一下午的雨。", when: "2 天前" }, col: 3.2, row: 4.5 },
];

/** 地區篩選：基隆不分區，其餘比對縣市＋區 */
export const inRegion = (h: Pick<CommunityHouse, "city" | "district">, regionId: string) => {
  if (regionId === "all") return true;
  const r = REGIONS.find(x => x.id === regionId);
  return !!r && h.city === r.city && (!r.district || h.district === r.district);
};
export const regionCounts = (houses: readonly CommunityHouse[]) =>
  REGIONS.map(r => {
    const hs = houses.filter(h => inRegion(h, r.id));
    return { ...r, houses: hs.length, cats: hs.reduce((n, h) => n + h.cats, 0), waiting: hs.reduce((n, h) => n + h.waiting, 0) };
  });

/** 公開位置只到縣市＋區（FR-02-07） */
export const publicLocation = (h: Pick<CommunityHouse, "city" | "district">) => `${h.city}${h.district}`;

const TW = 120, TH = 60; // 一格的寬、高（2:1 等角）
export const ISO = { tw: TW, th: TH, cx: 400, cy: 130 };

/** 小鎮格座標 → 畫面座標：col 往右下、row 往左下 */
export function isoProject(col: number, row: number) {
  return { x: ISO.cx + (col - row) * (TW / 2), y: ISO.cy + (col + row) * (TH / 2) };
}

/** 繪製順序：離觀看者遠（col+row 小）的先畫，近的蓋在上面 */
export const paintOrder = (houses: readonly CommunityHouse[]) => [...houses].sort((a, b) => a.col + a.row - (b.col + b.row));

export function roofCounts(houses: readonly CommunityHouse[]): Record<RoofKind, number> {
  const n: Record<RoofKind, number> = { waiting: 0, fresh: 0, normal: 0 };
  for (const h of houses) n[h.kind]++;
  return n;
}

/** 名牌寬度（14.5px 字：中文字約 15px、英數約 9px，加圓點與左右留白） */
export const tagWidth = (name: string) => 42 + Array.from(name).reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 15 : 9), 0);
