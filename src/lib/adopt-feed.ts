// 首頁「帶我回家」（#57）：把資料庫裡的待領養貓整理成卡片與地圖用的資料。
// 公開位置只到縣市＋區（FR-02-07）；喵戶不公開時讀不到喵戶，地區就留空。
import { LIFE_STAGE_LABEL, type LifeStage } from "./cat-profile/life-stage";
import { HEALTH_TAGS } from "./cat-profile/tags";
import type { CatFilter } from "./cats";

export interface FeedRow {
  id: string; name: string; sex: string; life_stage: LifeStage | null; personality_tags: string[] | null; health_tags: string[] | null;
  /** 結紮、FIV／FeLV 從醫療細項讀（#206） */
  medical: { neutered?: string; fivFelv?: string } | null;
  description: string | null; timeline: { date: string; event: string }[] | null; photo_url: string | null; created_at: string;
  household: { id: string; name: string; city: string | null; district: string | null; intro: string | null; caretaker_type: string } | null;
}

export interface FeedCat {
  id: string; name: string; sex: string; stage: string; district: string; waitDays: number; neutered: boolean;
  tags: string[]; diary: string; photo: string | null; filters: CatFilter[];
  home: { id: string; name: string; intro: string; foster: string } | null;
}

export interface FeedHome {
  id: string; name: string; district: string; intro: string; foster: string; waiting: string[]; latest: string; col: number; row: number;
}

/** 讀卡片需要的欄位（喵戶指定外鍵，見 lib/supabase/embeds.test.ts） */
export const FEED_SELECT =
  "id, name, sex, life_stage, personality_tags, health_tags, medical, description, timeline, photo_url, created_at, household:meow_households!meow_cats_household_id_fkey(id, name, city, district, intro, caretaker_type)";

const SEX: Record<string, string> = { male: "公貓", female: "母貓" };
const FOSTER: Record<string, string> = { personal_foster: "個人中途", shelter_org: "立案協會／收容單位" };
const FILTER_TAGS: [CatFilter, string[]][] = [
  ["newbie", ["親人", "黏人"]],
  ["active", ["活潑", "愛玩", "好奇"]],
  ["quiet", ["慵懶", "獨立"]],
  // 有任何身體狀況，或 FIV／FeLV 陽性（由醫療細項判斷）
  ["special", [...HEALTH_TAGS]],
];

const DAY = 86_400_000;

export function toFeedCat(r: FeedRow, today = new Date()): FeedCat {
  const tags = r.personality_tags ?? [];
  const health = r.health_tags ?? [];
  const latest = [...(r.timeline ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0]?.event;
  const firstSentence = r.description?.trim().match(/^[^。！？\n]*[。！？]?/)?.[0] ?? "";
  const h = r.household;
  const positive = Boolean(r.medical?.fivFelv && r.medical.fivFelv !== "negative" && r.medical.fivFelv !== "untested");
  return {
    id: r.id,
    name: r.name,
    sex: SEX[r.sex] ?? "",
    stage: r.life_stage ? LIFE_STAGE_LABEL[r.life_stage] ?? "" : "",
    district: h ? `${h.city ?? ""}${h.district ?? ""}` : "",
    waitDays: Math.max(0, Math.floor((today.getTime() - new Date(r.created_at).getTime()) / DAY)),
    neutered: r.medical?.neutered === "done",
    tags: [...tags, ...health.filter((t) => FILTER_TAGS[3][1].includes(t))].slice(0, 4),
    diary: latest ?? firstSentence,
    photo: r.photo_url,
    filters: FILTER_TAGS.filter(([f, words]) => words.some((w) => tags.includes(w) || health.includes(w)) || (f === "special" && positive)).map(([f]) => f),
    home: h ? { id: h.id, name: h.name, intro: h.intro ?? "", foster: FOSTER[h.caretaker_type] ?? "" } : null,
  };
}

// 地圖上可以放房子的位置（避開道路與河，跟原本的示意地圖一樣）
const SLOTS: [number, number][] = [[3.7, 0.8], [1.5, 0.9], [0.7, 3.2], [4.7, 1.2], [2.0, 4.4], [4.3, 4.2], [1.9, 2.9], [3.8, 3.0]];

/** 依喵戶分組；等最久的貓所在的喵戶排前面，最多放 SLOTS 個 */
export function feedHomes(cats: FeedCat[]): FeedHome[] {
  const byHome = new Map<string, FeedCat[]>();
  for (const c of [...cats].sort((a, b) => b.waitDays - a.waitDays)) {
    if (!c.home) continue;
    byHome.set(c.home.id, [...(byHome.get(c.home.id) ?? []), c]);
  }
  return [...byHome.values()].slice(0, SLOTS.length).map((list, i) => {
    const home = list[0].home!;
    return {
      id: home.id, name: home.name, district: list[0].district, intro: home.intro, foster: home.foster,
      waiting: list.map((c) => c.id), latest: list.find((c) => c.diary)?.diary ?? "",
      col: SLOTS[i][0], row: SLOTS[i][1],
    };
  });
}
