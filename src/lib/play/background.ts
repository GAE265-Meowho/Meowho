// 虛擬飼養 DEMO（#237）：玩家背景直接讀喵戶的 home 欄位（HouseholdForm／household-rules.ts），不另外問玩家，也不問作息。
// 沒登入、沒有喵戶或欄位缺漏時補範例值，整個流程照樣能玩。純函式。
import { ALONE, DWELLINGS, FAMILY, LIVING, NO_PETS, PETS } from "@/lib/onboarding/household-rules";

export interface PlayerHome {
  /** 住家型態（中文） */
  dwelling: string;
  /** 住家狀況（中文） */
  living: string;
  /** 同住的人；空陣列＝一個人住 */
  family: string[];
  /** 現有寵物；空陣列＝沒有 */
  pets: string[];
  /** true＝整份是範例背景（沒登入、沒喵戶或資料全空） */
  sample: boolean;
}

/** 範例背景：沒登入或沒喵戶時用 */
export const SAMPLE_HOME: PlayerHome = { dwelling: "電梯大樓", living: "租屋", family: ["伴侶"], pets: [], sample: true };

const OTHER_MAX = 30;
const clip = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, OTHER_MAX) : "");

/** none：表單裡代表「沒有」的選項（自己住、沒有），它不是人也不是寵物，要拿掉；other：「其他」沒填內容時的寫法 */
function pickList(raw: unknown, allowed: readonly string[], other: unknown, none: string, otherFallback: string): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((x): x is string => typeof x === "string" && allowed.includes(x) && x !== none)
    .map(x => (x === "其他" || x === "其他動物" ? clip(other) || otherFallback : x));
}

export function normalizeHome(raw: unknown): PlayerHome {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...SAMPLE_HOME };
  const r = raw as Record<string, unknown>;
  const dwellingKey = typeof r.dwelling === "string" && r.dwelling in DWELLINGS ? (r.dwelling as keyof typeof DWELLINGS) : null;
  const livingKey = typeof r.living === "string" && r.living in LIVING ? (r.living as keyof typeof LIVING) : null;
  const family = pickList(r.family, FAMILY, r.familyOther, ALONE, "家人");
  const pets = pickList(r.pets, PETS, r.petsOther, NO_PETS, "小動物");
  if (!dwellingKey && !livingKey && !family?.length && !pets?.length) return { ...SAMPLE_HOME };
  const dwelling = dwellingKey === "other" && clip(r.dwellingOther) ? clip(r.dwellingOther) : dwellingKey ? DWELLINGS[dwellingKey] : SAMPLE_HOME.dwelling;
  return {
    dwelling,
    living: livingKey ? LIVING[livingKey] : SAMPLE_HOME.living,
    family: family ?? [...SAMPLE_HOME.family],
    pets: pets ?? [...SAMPLE_HOME.pets],
    sample: false,
  };
}

/** 一行摘要：畫面顯示與 AI 輸入共用 */
export function homeSummary(h: PlayerHome): string {
  return [
    h.dwelling,
    h.living,
    h.family.length ? `和${h.family.join("、")}同住` : "一個人住",
    h.pets.length ? `家裡有${h.pets.join("、")}` : "沒有其他寵物",
  ].join("・");
}
