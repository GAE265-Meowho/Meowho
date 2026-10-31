// 送養文常見欄位（#82）：送養條件、醫療細項、相處、生活習慣、交接物品。
// 清單依中途愛媽訪談與公開的認養切結書整理（見 #82 Further Notes）；資料庫只存文字，清單改這裡即可。
import { z } from "zod";
import type { HealthTag } from "./tags";

export const ADOPTION_TERMS = [
  "年滿 20 歲或家人同意", "不放養", "門窗防護", "家訪", "簽切結書", "定期追蹤回報", "不轉送不棄養", "未結紮者須配合結紮", "租屋須房東同意",
] as const;
export type AdoptionTerm = (typeof ADOPTION_TERMS)[number];

export const HABITS = ["會用貓砂", "護食", "抓家具", "夜間活躍", "怕吸塵器", "愛咬手", "會開門"] as const;
export const HANDOVER_ITEMS = ["疫苗卡或病歷", "慣用飼料", "貓砂", "玩具", "外出籠"] as const;

export const AdoptionTermsSchema = z.object({
  items: z.array(z.enum(ADOPTION_TERMS)).max(ADOPTION_TERMS.length),
  note: z.string().max(300),
});
export type AdoptionTerms = z.infer<typeof AdoptionTermsSchema>;

/** AI 或使用者給的條件：清單內的保留（去重、依清單順序），其他併進自訂文字 */
export function pickTerms(input: readonly string[], note: string): AdoptionTerms {
  const items = ADOPTION_TERMS.filter((t) => input.includes(t));
  const extra = input.filter((t) => !(ADOPTION_TERMS as readonly string[]).includes(t)).map((t) => t.trim()).filter(Boolean);
  return { items, note: [note.trim(), ...extra].filter(Boolean).join("；").slice(0, 300) };
}

/** 貓沒有個別設定時沿用喵戶預設 */
export const effectiveTerms = (cat: AdoptionTerms | null, home: AdoptionTerms | null): AdoptionTerms =>
  cat ?? home ?? { items: [], note: "" };

const Done = z.enum(["done", "not_done", "unknown"]);
export const MedicalSchema = z.object({
  neutered: Done,
  /** 結紮日期或還沒結紮時的預計安排 */
  neuterNote: z.string().max(100),
  vaccineDoses: z.number().int().min(0).max(5).nullable(),
  lastVaccineDate: z.string().max(10).nullable(),
  dewormInternal: Done,
  dewormExternal: Done,
  fivFelv: z.enum(["negative", "fiv_positive", "felv_positive", "both_positive", "untested"]),
  testDate: z.string().max(10).nullable(),
  microchip: z.enum(["yes", "no", "unknown"]),
  history: z.string().max(300),
  medication: z.string().max(200),
});
export type Medical = z.infer<typeof MedicalSchema>;

export const emptyMedical = (): Medical => ({
  neutered: "unknown", neuterNote: "", vaccineDoses: null, lastVaccineDate: null, dewormInternal: "unknown", dewormExternal: "unknown",
  fivFelv: "untested", testDate: null, microchip: "unknown", history: "", medication: "",
});

const Ok = z.enum(["yes", "no", "unknown"]);
export const CompatSchema = z.object({ cats: Ok, dogs: Ok, kids: Ok });
export type Compat = z.infer<typeof CompatSchema>;
export const emptyCompat = (): Compat => ({ cats: "unknown", dogs: "unknown", kids: "unknown" });

/** 醫療細項是比較完整的來源，健康標籤（快速標籤）由它帶出；疫苗打滿 3 劑才算完成 */
export function healthTagsFromMedical(m: Medical): HealthTag[] {
  const tags: HealthTag[] = [];
  if (m.neutered === "done") tags.push("已結紮");
  if ((m.vaccineDoses ?? 0) >= 3) tags.push("疫苗已完成");
  if (m.dewormInternal === "done" && m.dewormExternal === "done") tags.push("已驅蟲");
  if (m.fivFelv === "fiv_positive" || m.fivFelv === "both_positive") tags.push("FIV 陽性");
  if (m.fivFelv === "felv_positive" || m.fivFelv === "both_positive") tags.push("FeLV 陽性");
  if (m.medication.trim()) tags.push("需每日用藥");
  return tags;
}
