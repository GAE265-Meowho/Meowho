/**
 * 喵戶 on the 帶我回家 map. Same isometric conventions as the team app's
 * 喵戶小區 (src/lib/community.ts in GAE265-Meowho/MeowHome): 2:1 grid, roof
 * colour = status. Demo data; public location stops at city + district.
 */
export type RoofKind = "waiting" | "fresh" | "normal";

export type Household = {
  id: string;
  name: string;
  district: string;
  owner: string;
  kind: RoofKind;
  intro: string;
  /** Names of this household's cats that are waiting for a home (see lib/cats.ts). */
  waiting: string[];
  latest: string;
  col: number;
  row: number;
};

export const ROOF_LEGEND: { kind: RoofKind; label: string }[] = [
  { kind: "waiting", label: "有貓在等新家" },
  { kind: "fresh", label: "剛移轉到新家" },
  { kind: "normal", label: "一般喵戶" },
];

export const households: Household[] = [
  {
    id: "xiaoqing",
    name: "小晴的中途貓屋",
    district: "台中市北屯區",
    owner: "小晴",
    kind: "waiting",
    intro: "個人中途，第一次照顧親人的橘貓，每天都寫日記。",
    waiting: ["橘子"],
    latest: "橘子今天第一次自己走進外出籠，獎勵了一根肉泥。",
    col: 3.7,
    row: 0.8,
  },
  {
    id: "naicha",
    name: "三花奶茶的中途日記",
    district: "台中市北區",
    owner: "阿綾",
    kind: "waiting",
    intro: "專收熟齡貓的中途，奶茶需要吃泌尿道處方飼料。",
    waiting: ["奶茶"],
    latest: "奶茶今天把處方飼料吃光光，喝水量也穩定了。",
    col: 1.5,
    row: 0.9,
  },
  {
    id: "heitang",
    name: "窗邊的黑糖",
    district: "台中市西屯區",
    owner: "Mia",
    kind: "waiting",
    intro: "公寓裡的小中途，黑糖最愛窗邊的那塊陽光。",
    waiting: ["黑糖"],
    latest: "下午的陽光剛好照在窗邊，黑糖從一點睡到五點。",
    col: 0.7,
    row: 3.2,
  },
  {
    id: "zhima",
    name: "豐原芝麻眼藥站",
    district: "台中市豐原區",
    owner: "陳媽媽",
    kind: "waiting",
    intro: "照顧需要長期點眼藥的貓，有耐心的領養人最適合。",
    waiting: ["芝麻"],
    latest: "芝麻點完眼藥就討肉泥，越來越不生氣了。",
    col: 4.7,
    row: 1.2,
  },
  {
    id: "mochi",
    name: "麻糬與牠的朋友們",
    district: "台中市南屯區",
    owner: "Ken",
    kind: "waiting",
    intro: "多貓中途，麻糬是最會撒嬌的那一隻。",
    waiting: ["麻糬"],
    latest: "梳毛梳出一整隻小麻糬，呼嚕聲大到隔壁房間都聽得到。",
    col: 2.0,
    row: 4.4,
  },
  {
    id: "douhua",
    name: "大里豆花家",
    district: "台中市大里區",
    owner: "Yuki",
    kind: "waiting",
    intro: "剛救援的小貓豆花，正在學習信任人類。",
    waiting: ["豆花"],
    latest: "豆花發現新紙箱，探頭探腦了整整十分鐘才敢進去。",
    col: 4.3,
    row: 4.2,
  },
  {
    id: "ahu",
    name: "阿虎的新家",
    district: "台中市西區",
    owner: "Rita",
    kind: "fresh",
    intro: "阿虎從中途移轉到這裡第 14 天，時光小屋繼續寫新家時期。",
    waiting: [],
    latest: "阿虎已經會在樓梯口等下班的我。",
    col: 1.9,
    row: 2.9,
  },
  {
    id: "laomao",
    name: "老貓小日子",
    district: "台中市南區",
    owner: "老王",
    kind: "normal",
    intro: "兩隻 12 歲的老貓，每天曬太陽、睡午覺。",
    waiting: [],
    latest: "兩隻老貓擠在同一個貓窩，誰也不讓誰。",
    col: 3.8,
    row: 3.0,
  },
];

const TW = 120;
const TH = 60;
const CX = 400;
const CY = 130;

/** Grid (col, row) → SVG point: col runs down-right, row runs down-left. */
export function isoProject(col: number, row: number) {
  return { x: CX + (col - row) * (TW / 2), y: CY + (col + row) * (TH / 2) };
}

/** Far houses first, near ones on top. */
export const paintOrder = (list: readonly Household[]) => [...list].sort((a, b) => a.col + a.row - (b.col + b.row));

/** Rough pill width for a 14px label: CJK ≈ 14px, latin ≈ 8.5px, plus padding. */
export const labelWidth = (text: string) => Array.from(text).reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 14 : 8.5), 0);
