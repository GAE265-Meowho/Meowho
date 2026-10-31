import { photos, type Photo } from "./photos";

export type CatFilter = "newbie" | "active" | "quiet" | "special";

export type AdoptableCat = {
  name: string;
  sex: "公貓" | "母貓";
  age: string;
  district: string;
  waitDays: number;
  neutered: boolean;
  tags: string[];
  /** One line from the 中途's diary — the real day-to-day, not a sales pitch. */
  diary: string;
  affinity: number;
  energy: number;
  filters: CatFilter[];
  photo: Photo;
};

// Demo data for the prototype (台中市). 橘子 is the same cat as the 3D guide.
export const cats: AdoptableCat[] = [
  {
    name: "奶茶",
    sex: "母貓",
    age: "9 歲",
    district: "台中市北區",
    waitDays: 302,
    neutered: true,
    tags: ["黏人", "需要處方飼料"],
    diary: "按時吃泌尿道處方飼料，喝水量比上週多。",
    affinity: 5,
    energy: 2,
    filters: ["quiet", "special"],
    photo: photos.naicha,
  },
  {
    name: "黑糖",
    sex: "母貓",
    age: "5 歲",
    district: "台中市西屯區",
    waitDays: 210,
    neutered: true,
    tags: ["安靜", "獨立", "愛曬太陽"],
    diary: "白天幾乎都在窗邊睡，晚上會來床邊陪睡。",
    affinity: 3,
    energy: 2,
    filters: ["quiet", "newbie"],
    photo: photos.heitang,
  },
  {
    name: "芝麻",
    sex: "公貓",
    age: "7 歲",
    district: "台中市豐原區",
    waitDays: 150,
    neutered: true,
    tags: ["慢熟", "每天點眼藥"],
    diary: "眼藥水分兩次點，點完給一口肉泥就不生氣了。",
    affinity: 2,
    energy: 2,
    filters: ["special"],
    photo: photos.zhima,
  },
  {
    name: "橘子",
    sex: "公貓",
    age: "2 歲",
    district: "台中市北屯區",
    waitDays: 96,
    neutered: true,
    tags: ["親人", "愛踩踏", "怕吸塵器"],
    diary: "食慾穩定，每天追逗貓棒兩回合，週三吐了一次毛球。",
    affinity: 5,
    energy: 4,
    filters: ["newbie", "active"],
    photo: photos.juzi,
  },
  {
    name: "麻糬",
    sex: "母貓",
    age: "3 歲",
    district: "台中市南屯區",
    waitDays: 64,
    neutered: true,
    tags: ["溫和", "愛被梳毛"],
    diary: "很享受梳毛時間，會發出很大聲的呼嚕。",
    affinity: 4,
    energy: 3,
    filters: ["newbie", "quiet"],
    photo: photos.mochi,
  },
  {
    name: "豆花",
    sex: "母貓",
    age: "6 個月",
    district: "台中市大里區",
    waitDays: 38,
    neutered: false,
    tags: ["好奇", "愛玩紙箱"],
    diary: "第一次自己鑽進紙箱，玩到直接在裡面睡著。",
    affinity: 4,
    energy: 5,
    filters: ["active"],
    photo: photos.douhua,
  },
];
