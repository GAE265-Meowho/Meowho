// 示意資料：之後由 Supabase 取代（見 tickets）
import type { PhotoKey } from "./photos";
export type Coat = "orange" | "black" | "cream" | "tabby" | "calico" | "gray" | "tuxedo";
export type AgeBand = "幼貓" | "成貓" | "熟齡" | "老貓";

export interface Cat {
  id: number;
  name: string;
  sex: "♂" | "♀";
  age: string;
  ageBand: AgeBand;
  city: string;
  dist: string;
  coat: Coat;
  waitDays: number;
  tags: string[];
  novice: boolean;
  special: boolean;
  independent: boolean;
  kids: boolean;
  week: string;
  why: string;
  photo: PhotoKey;
  neutered: boolean;
}

export interface Logo { id: "house" | "round" | "line"; name: string; src: string }

export const LOGOS: Logo[] = [
  { id: "house", name: "小屋摸摸款", src: "/logos/logo-house.jpg" },
  { id: "round", name: "圓形花貓款", src: "/logos/logo-round.jpg" },
  { id: "line", name: "橫式字標款", src: "/logos/logo-line.jpg" },
];

export const DEFAULT_CITY = "台中市";
export const STATS = { waiting: 128, matched: 36, users: 542 };

export const CATS: Cat[] = [
  { id: 1, name: "橘子", photo: "orange", neutered: true, sex: "♂", age: "2 歲", ageBand: "成貓", city: "台中市", dist: "北屯區", coat: "orange", waitDays: 96,
    tags: ["親人", "愛踩踏", "怕吸塵器"], novice: true, special: false, independent: false, kids: true,
    week: "食慾穩定，每天追逗貓棒兩回合，週三吐了一次毛球。",
    why: "中途日記常寫到牠主動討摸、不怕陌生人，很適合第一次養貓。" },
  { id: 2, name: "黑糖", photo: "black", neutered: true, sex: "♀", age: "5 歲", ageBand: "成貓", city: "台中市", dist: "西屯區", coat: "black", waitDays: 210,
    tags: ["安靜", "獨立", "愛曬太陽"], novice: true, special: false, independent: true, kids: false,
    week: "白天幾乎都在窗邊睡，晚上會來床邊陪睡。",
    why: "週報顯示白天多睡、作息規律，上班族也能安心照顧。" },
  { id: 3, name: "麻糬", photo: "cream", neutered: true, sex: "♀", age: "3 歲", ageBand: "成貓", city: "台中市", dist: "南屯區", coat: "cream", waitDays: 64,
    tags: ["溫和", "愛被梳毛"], novice: true, special: false, independent: false, kids: true,
    week: "很享受梳毛時間，會發出很大聲的呼嚕。",
    why: "跟中途家的小朋友相處很好，個性溫和不太會出爪。" },
  { id: 4, name: "阿虎", photo: "tabby", neutered: true, sex: "♂", age: "1 歲", ageBand: "幼貓", city: "台中市", dist: "大里區", coat: "tabby", waitDays: 38,
    tags: ["活潑", "好奇", "愛玩紙箱"], novice: false, special: false, independent: false, kids: true,
    week: "精力超旺盛，半夜會在走廊跑酷。",
    why: "需要很多玩耍時間，適合在家時間長、喜歡陪玩的人。" },
  { id: 5, name: "奶茶", photo: "calico", neutered: true, sex: "♀", age: "9 歲", ageBand: "熟齡", city: "台中市", dist: "北區", coat: "calico", waitDays: 302,
    tags: ["黏人", "需要處方飼料"], novice: false, special: true, independent: false, kids: false,
    week: "按時吃泌尿道處方飼料，喝水量比上週多。",
    why: "有泌尿道病史、需要固定飲食照護，適合願意多花心思的人。" },
  { id: 6, name: "灰灰", photo: "gray", neutered: true, sex: "♂", age: "4 歲", ageBand: "成貓", city: "台北市", dist: "大安區", coat: "gray", waitDays: 150,
    tags: ["慢熟", "獨立"], novice: true, special: false, independent: true, kids: false,
    week: "開始願意在客廳睡午覺了。",
    why: "慢熟但不黏人，適合生活步調安靜的家庭。" },
  { id: 7, name: "豆花", photo: "tuxedo", neutered: false, sex: "♀", age: "6 個月", ageBand: "幼貓", city: "高雄市", dist: "鼓山區", coat: "tuxedo", waitDays: 21,
    tags: ["親人", "愛撒嬌"], novice: true, special: false, independent: false, kids: true,
    week: "疫苗打完第二劑，體重穩定上升。",
    why: "很親人又愛撒嬌，跟小孩相處很融洽。" },
  { id: 8, name: "芝麻", photo: "blackBox", neutered: true, sex: "♂", age: "11 歲", ageBand: "老貓", city: "台南市", dist: "東區", coat: "black", waitDays: 420,
    tags: ["溫和", "腎臟照護"], novice: false, special: true, independent: true, kids: false,
    week: "定期回診，腎指數維持穩定。",
    why: "需要定期回診與腎臟照護，適合有經驗的照顧者。" },
];

export type PostKind = "adoptable" | "adopted";
/** adoptable＝待領養（中途／貓戶長寫下的日常）；adopted＝幸福家貓（移轉到新家之後） */
export const POSTS: { kind: PostKind; home: string; city: string; time: string; text: string; likes: number; comments: number; photo: PhotoKey; tape: "pink" | "mint" | "butter" }[] = [
  { kind: "adoptable", home: "小橘之家", city: "台中市北屯區", time: "2 小時前", photo: "orangeJump", tape: "pink", text: "橘子今天第一次自己走進外出籠，獎勵了一根肉泥 🧡", likes: 24, comments: 5 },
  { kind: "adopted", home: "窗邊的黑糖", city: "台中市西屯區", time: "昨天", photo: "blackBox", tape: "mint", text: "下午的陽光剛好照在貓窩上，黑糖從一點睡到五點。", likes: 41, comments: 8 },
  { kind: "adopted", home: "麻糬與牠的朋友們", city: "台中市南屯區", time: "3 天前", photo: "ragdoll", tape: "butter", text: "梳毛梳出一整隻小麻糬，呼嚕聲大到隔壁房間都聽得到。", likes: 33, comments: 3 },
  { kind: "adoptable", home: "三花奶茶的中途日記", city: "台中市北區", time: "4 天前", text: "奶茶今天把處方飼料吃光光，喝水量也穩定了，給牠一個大大的讚。", likes: 52, comments: 11, photo: "calicoEat", tape: "pink" },
  { kind: "adoptable", home: "大里豆花之家", city: "台中市大里區", time: "3 天前", photo: "tabby", tape: "butter", text: "豆花發現新紙箱，探頭探腦了整整十分鐘才敢進去。", likes: 33, comments: 3 },
  { kind: "adopted", home: "阿虎的新家", city: "新北市板橋區", time: "5 天前", photo: "gray", tape: "mint", text: "移轉到新家的第 14 天，阿虎已經會在樓梯口等下班的我。", likes: 52, comments: 11 },
];

export const KB = [
  { band: "幼貓", range: "0–1 歲", bg: "#FBE3B0", title: "第一年的疫苗與結紮時程", desc: "什麼時候打疫苗、什麼時候結紮，一次看懂。" },
  { band: "成貓", range: "1–7 歲", bg: "#F3D2B0", title: "第一年大概要花多少錢？", desc: "飼料、貓砂、健檢與保險，用數字估給你看。" },
  { band: "熟齡", range: "7–10 歲", bg: "#E9C9A4", title: "熟齡貓的飲食調整", desc: "體重、泌尿道與關節，開始需要多注意的地方。" },
  { band: "居家", range: "安全", bg: "#E5D3BD", title: "接貓回家前的居家檢查", desc: "窗戶、電線、植物，三個最常被忽略的風險。" },
];
