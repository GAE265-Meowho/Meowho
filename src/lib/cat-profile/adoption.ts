// 送養文常見欄位（#82）：送養條件、醫療細項、相處、生活習慣、交接物品。
// 清單依中途愛媽訪談與公開的認養切結書整理（見 #82 Further Notes）；資料庫只存文字，清單改這裡即可。
import { z } from "zod";
import type { HealthTag } from "./tags";

export const ADOPTION_TERMS = [
  "年滿 20 歲或家人同意", "不放養", "門窗防護", "家訪", "簽切結書", "定期追蹤回報", "不轉送不棄養", "未結紮者須配合結紮", "租屋須房東同意",
] as const;
export type AdoptionTerm = (typeof ADOPTION_TERMS)[number];

/** 平常的習慣（設計稿「快問快答 3」，#206）：分組給畫面用；資料庫存文字。咬手、抓家具、護食等改放小小壞習慣（behavior） */
export const HABIT_GROUPS = [
  { title: "上廁所", items: ["會用貓砂", "習慣在外面上"] },
  { title: "吃飯", items: ["乾飼料", "罐頭", "濕食", "挑食"] },
  { title: "什麼時候最有精神", items: ["清晨討飯", "半夜跑酷", "白天"] },
  { title: "喜歡待在", items: ["高處", "躲起來的地方", "人的旁邊"] },
  { title: "愛玩的", items: ["逗貓棒", "追球", "埋伏撲腳"] },
  { title: "還要注意", items: ["會開門", "會跳上桌偷吃", "怕吸塵器", "怕打雷"] },
] as const;
export const HABITS = HABIT_GROUPS.flatMap((g) => g.items) as readonly (typeof HABIT_GROUPS)[number]["items"][number][];
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

/** 跟誰處得來（#206）：可以／看情況／不行／沒遇過；選看情況或不行時可以補一句說明 */
export const COMPAT_KEYS = ["cats", "dogs", "kids", "guest"] as const;
export type CompatKey = (typeof COMPAT_KEYS)[number];
export const COMPAT_LABEL: Record<CompatKey, string> = { cats: "其他貓", dogs: "狗", kids: "小孩", guest: "陌生人" };
const Ok = z.enum(["yes", "maybe", "no", "unknown"]);
export const CompatSchema = z.object({
  cats: Ok, dogs: Ok, kids: Ok, guest: Ok,
  notes: z.object({ cats: z.string().max(100), dogs: z.string().max(100), kids: z.string().max(100), guest: z.string().max(100) }).partial(),
});
export type Compat = z.infer<typeof CompatSchema>;
export const emptyCompat = (): Compat => ({ cats: "unknown", dogs: "unknown", kids: "unknown", guest: "unknown", notes: {} });

/** 貓咪的小小壞習慣（#206）：沒有／偶爾／常常／不確定。選「沒有」也顯示在名片上；偶爾或常常可以補一句說明 */
export const BEHAVIOR_ITEMS = [
  ["pee", "亂尿"], ["bite", "咬人或抓人"], ["guard", "護食"], ["scratch", "抓家具"],
  ["sep", "你出門後一直叫"], ["night", "半夜吵鬧"], ["chew", "咬電線或塑膠袋"], ["door", "衝門口"],
] as const;
export type BehaviorKey = (typeof BEHAVIOR_ITEMS)[number][0];
export const BEHAVIOR_LEVEL_LABEL = { none: "沒有", sometimes: "偶爾", often: "常常", unknown: "不確定" } as const;
const BehaviorEntry = z.object({ level: z.enum(["none", "sometimes", "often", "unknown"]), note: z.string().max(100).nullable() });
export const BehaviorSchema = z.object(Object.fromEntries(BEHAVIOR_ITEMS.map(([k]) => [k, BehaviorEntry])) as Record<BehaviorKey, typeof BehaviorEntry>).partial();
export type Behavior = z.infer<typeof BehaviorSchema>;
/** 咬人或抓人是偶爾或常常 → 個性標籤加上「愛咬人」（tags.ts 的 personalityTags） */
export const bitesOf = (b: Behavior) => b.bite?.level === "sometimes" || b.bite?.level === "often";

/** 照護、相處細項以外的其他資料（meow_cats.care，#206；格式照設計稿 toMeowhoPayload 的 care） */
export const CARE_ITEMS = [["nail", "剪指甲"], ["hold", "抱起來"], ["carrier", "進外出籠"], ["pill", "餵藥"], ["brush", "梳毛"], ["teeth", "刷牙"], ["vet", "看醫生"]] as const;
export const ARRIVAL_ITEMS = [["hide", "躲到願意出來"], ["eat", "開始吃飯"], ["touch", "讓你摸"]] as const;
export const TOUCH_ZONES = [["top", "頭頂"], ["ear", "耳後"], ["cheek", "臉頰兩側"], ["chin", "下巴"], ["back", "背"], ["butt", "屁股"], ["tail", "尾巴"], ["belly", "肚子"], ["paw", "腳掌"]] as const;
export const TOUCH_SIGNS = [["tail", "甩尾巴"], ["ears", "耳朵往後"], ["skin", "背上皮膚抖"], ["look", "回頭看你"], ["leave", "直接走開"], ["nip", "輕咬一下"], ["bite", "用力咬或抓"]] as const;
const str = (n: number) => z.string().max(n).nullable();
export const CareSchema = z.object({
  handling: z.record(z.string(), z.enum(["easy", "tricky", "hard", "untried"])),
  arrival: z.record(z.string(), z.enum(["same_day", "1_3_days", "within_week", "longer"])),
  touch: z.record(z.string(), z.enum(["love", "ok", "no"])),
  touchLimit: z.enum(["few_strokes", "1_2_min", "long", "mood"]).nullable(),
  touchSigns: z.array(z.string().max(20)).max(TOUCH_SIGNS.length),
  origin: z.enum(["street", "abandoned", "rehomed", "shelter"]).nullable(),
  since: str(10),
  weightKg: z.number().min(0).max(20).nullable(),
  favoriteSnack: str(100), cautionNote: str(200), otherNote: str(300),
}).partial();
export type Care = z.infer<typeof CareSchema>;

/** 健康標籤是身體狀況（#206）；結紮、疫苗、驅蟲、FIV／FeLV、晶片直接由醫療細項顯示。醫療細項只會帶出「每天吃藥」 */
export function healthTagsFromMedical(m: Medical): HealthTag[] {
  return m.medication.trim() ? ["每天吃藥"] : [];
}
