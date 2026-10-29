// 喵戶小區（Issue #44）：每間房子是一個貓戶。第一版用示意資料，之後換 meow_households（只取縣市＋區）。
export type RoofKind = "waiting" | "rescue" | "normal";

export interface CommunityHouse {
  id: string;
  name: string;
  city: string;
  district: string;
  kind: RoofKind;
  cats: number; // 目前照顧的貓數
  waiting: number; // 等新家的貓數
  intro: string;
  col: number; // 小鎮格座標（0～5）
  row: number;
}

export const ROOF_LEGEND: { kind: RoofKind; label: string; color: string }[] = [
  { kind: "waiting", label: "黃屋頂：有貓等新家", color: "#F2B73F" },
  { kind: "rescue", label: "粉屋頂：中途救援中", color: "#E3668F" },
  { kind: "normal", label: "白屋頂：一般貓戶", color: "#FFFFFF" },
];

export const COMMUNITY_HOUSES: CommunityHouse[] = [
  { id: "douhua", name: "豆花的家", city: "台中市", district: "北屯區", kind: "waiting", cats: 4, waiting: 2, intro: "兩隻親人的橘白貓在等新家，其他孩子是家貓。", col: 2.2, row: 2.2 },
  { id: "xiangkou", name: "巷口中途屋", city: "台中市", district: "西屯區", kind: "waiting", cats: 8, waiting: 5, intro: "個人中途，目前有 5 隻貓在找家，歡迎先私訊聊聊。", col: 0.4, row: 1.6 },
  { id: "laomao", name: "老貓小日子", city: "新北市", district: "板橋區", kind: "normal", cats: 2, waiting: 0, intro: "兩隻 12 歲的老貓，每天曬太陽、睡午覺。", col: 3.8, row: 0.4 },
  { id: "aidi", name: "愛迪三喵", city: "台北市", district: "大安區", kind: "normal", cats: 3, waiting: 0, intro: "三兄妹一起長大，最愛紙箱。", col: 4.9, row: 1.5 },
  { id: "baodao", name: "新貓報到中", city: "高雄市", district: "鼓山區", kind: "rescue", cats: 6, waiting: 3, intro: "剛救援的一批小貓，正在驅蟲、打疫苗。", col: 4.6, row: 3.9 },
  { id: "xiaoju", name: "小橘之家", city: "台中市", district: "西屯區", kind: "waiting", cats: 5, waiting: 1, intro: "社區愛媽的中途站，橘子等你來認識。", col: 1.0, row: 3.6 },
  { id: "yunduo", name: "雲朵貓舍", city: "桃園市", district: "中壢區", kind: "normal", cats: 1, waiting: 0, intro: "一隻布偶，個性像雲一樣軟。", col: 2.9, row: 4.4 },
  { id: "haian", name: "海岸救援站", city: "基隆市", district: "中正區", kind: "rescue", cats: 9, waiting: 4, intro: "協會立案的救援站，歡迎捐物資與志工。", col: 3.4, row: 2.9 },
  { id: "zhima", name: "芝麻小屋", city: "台南市", district: "東區", kind: "normal", cats: 2, waiting: 0, intro: "黑貓芝麻和三花麻糬的日常。", col: 1.4, row: 0.2 },
];

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
  const n: Record<RoofKind, number> = { waiting: 0, rescue: 0, normal: 0 };
  for (const h of houses) n[h.kind]++;
  return n;
}

/** 名牌寬度（14.5px 字：中文字約 15px、英數約 9px，加圓點與左右留白） */
export const tagWidth = (name: string) => 42 + Array.from(name).reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 15 : 9), 0);
