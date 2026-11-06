// 依身分建立喵戶（#82）：一般飼主的喵戶是「自己的家」，中途的喵戶是「送養據點」。
// 純函式，畫面與測試共用。位置只存到縣市＋區（AGENTS.md §6）。
import { AdoptionTermsSchema, type AdoptionTerms } from "../cat-profile/adoption";
import { isKnownDistrict } from "../geo/tw-districts";
import { cleanName, parseDistrict, type CaretakerType } from "./household";
import { z } from "zod";

export const ROLE_INFO: Record<CaretakerType, { label: string; hint: string }> = {
  cat_owner: { label: "一般飼主", hint: "準備領養，或家裡已經有貓" },
  personal_foster: { label: "個人中途", hint: "自己照顧、送養浪貓" },
  shelter_org: { label: "立案協會／收容單位", hint: "有立案的協會或收容單位" },
};
export const ROLES = Object.keys(ROLE_INFO) as CaretakerType[];

export const DWELLINGS = { apartment: "公寓", building: "電梯大樓", house: "透天", other: "其他" } as const;
export const LIVING = { rent: "租屋", own: "自有", family: "與家人同住" } as const;
// 「自己住」「沒有」只能單選，用來和「還沒填」分開（試養遊戲讀得到明確答案，#233）
export const FAMILY = ["自己住", "小孩", "長輩", "伴侶", "室友", "其他"] as const;
export const PETS = ["沒有", "貓", "狗", "其他動物"] as const;
export const ALONE = "自己住";
export const NO_PETS = "沒有";
/** 租屋時，房東同不同意養貓（兩位愛媽的問卷都有問，送養條件也有「租屋須房東同意」） */
export const LANDLORD = { yes: "同意", asking: "還在問", no: "不同意" } as const;
/** 養貓經驗（愛媽認為最有用的題目之一，#233） */
export const EXPERIENCE = { none: "沒養過貓", some: "養過，不到 3 年", long: "養過 3 年以上" } as const;
/** 每月養貓預算上限（和 0025 的 check 一致） */
export const BUDGET_MAX = 200000;

// 選「其他」時的補充文字存在 *Other 欄位（#89）
export const HomeSchema = z.object({
  dwelling: z.enum(Object.keys(DWELLINGS) as [keyof typeof DWELLINGS]).nullable(),
  dwellingOther: z.string().max(30),
  living: z.enum(Object.keys(LIVING) as [keyof typeof LIVING]).nullable(),
  family: z.array(z.enum(FAMILY)),
  familyOther: z.string().max(30),
  pets: z.array(z.enum(PETS)),
  petsOther: z.string().max(30),
  landlord: z.enum(Object.keys(LANDLORD) as [keyof typeof LANDLORD]).nullable(),
  experience: z.enum(Object.keys(EXPERIENCE) as [keyof typeof EXPERIENCE]).nullable(),
});
export type Home = z.infer<typeof HomeSchema>;

export interface HouseholdForm {
  role: CaretakerType | null;
  name: string;
  city: string | null;
  district: string;
  intro: string;
  home: Home;
  terms: AdoptionTerms | null;
  orgName: string;
  orgProofUrl: string;
  /** 個人中途可以順便申請中途徽章；立案中途一定會送 */
  applyBadge: boolean;
  /** 一般飼主的每月養貓預算（輸入框的文字）；存在 meow_household_budgets，不跟喵戶一起公開（0025） */
  budget: string;
}

export const emptyHouseholdForm = (): HouseholdForm => ({
  role: null, name: "", city: null, district: "", intro: "",
  home: { dwelling: null, dwellingOther: "", living: null, family: [], familyOther: "", pets: [], petsOther: "", landlord: null, experience: null },
  terms: null, orgName: "", orgProofUrl: "", applyBadge: false, budget: "",
});

export type MissingField = "role" | "name" | "nameTaken" | "city" | "district" | "dwelling" | "living" | "landlord" | "family" | "pets" | "experience" | "budget" | "orgName" | "orgProofUrl";

/** 每月預算：1～200,000 的整數，可以寫千分位；不合格回傳 null */
export function parseBudget(typed: string): number | null {
  const t = typed.replace(/[,，\s]/g, "");
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= BUDGET_MAX ? n : null;
}

/** 多選裡的單選項（「自己住」「沒有」）：新選了它就只留它；選了別的就拿掉它 */
export function pickSolo<T extends string>(prev: readonly T[], next: T[], solo: T): T[] {
  if (next.includes(solo) && !prev.includes(solo)) return [solo];
  return next.length > 1 ? next.filter(x => x !== solo) : next;
}

/** 比對喵戶名稱用：忽略前後空白、全形空白與大小寫 */
export const sameName = (a: string) => cleanName(a).replace(/\s+/g, " ").toLowerCase();

/** 寫「北屯區」或只寫「北屯」都可以 */
export function normalizeDistrict(city: string | null, typed: string): string | null {
  const t = typed.trim();
  if (!city || !t) return null;
  return parseDistrict(`${city}${t}`, city) ?? (t.length >= 2 ? `${t}區` : null);
}

const isUrl = (s: string) => /^https?:\/\/\S+\.\S+/.test(s.trim());

/** existingNames：這個帳號已有的喵戶名稱（名稱在同一個帳號裡不能重複，資料庫 trigger 也會擋） */
export function checkHousehold(f: HouseholdForm, existingNames: string[] = []): MissingField[] {
  const miss: MissingField[] = [];
  if (!f.role) miss.push("role");
  if (f.role && cleanName(f.name).length < 2) miss.push("name");
  else if (f.role && existingNames.some(n => sameName(n) === sameName(f.name))) miss.push("nameTaken");
  if (!f.city) miss.push("city");
  // 區從該縣市的清單選（#89）
  if (!isKnownDistrict(f.city, f.district)) miss.push("district");
  if (f.role === "cat_owner") {
    const h = f.home;
    if (!h.dwelling) miss.push("dwelling");
    if (!h.living) miss.push("living");
    if (h.living === "rent" && !h.landlord) miss.push("landlord");
    if (!h.family.length) miss.push("family");
    if (!h.pets.length) miss.push("pets");
    if (!h.experience) miss.push("experience");
    if (parseBudget(f.budget) === null) miss.push("budget");
  }
  if (f.role === "shelter_org") {
    if (!f.orgName.trim()) miss.push("orgName");
    if (!isUrl(f.orgProofUrl)) miss.push("orgProofUrl");
  }
  return miss;
}

/** 沒選「其他」時，不留補充文字 */
const cleanHome = (h: Home): Home => ({
  ...h,
  dwellingOther: h.dwelling === "other" ? h.dwellingOther.trim() : "",
  familyOther: h.family.includes("其他") ? h.familyOther.trim() : "",
  petsOther: h.pets.includes("其他動物") ? h.petsOther.trim() : "",
  landlord: h.living === "rent" ? h.landlord : null,
});

/** 一般飼主的每月預算 → meow_household_budgets 一筆；中途或沒填好回傳 null */
export function budgetRow(f: HouseholdForm, householdId: string) {
  const n = parseBudget(f.budget);
  return f.role === "cat_owner" && n !== null ? { household_id: householdId, monthly_twd: n } : null;
}

export function toHouseholdRow(f: HouseholdForm) {
  const owner = f.role === "cat_owner";
  return {
    name: cleanName(f.name),
    caretaker_type: f.role,
    city: f.city,
    district: f.district,
    intro: f.intro.trim(),
    allow_stranger_messages: true,
    default_visibility: "public" as const,
    home: owner ? HomeSchema.parse(cleanHome(f.home)) : null,
    adoption_terms: owner || !f.terms ? null : AdoptionTermsSchema.parse(f.terms),
    org_name: f.role === "shelter_org" ? f.orgName.trim() : null,
    org_proof_url: f.role === "shelter_org" ? f.orgProofUrl.trim() : null,
  };
}

/** 一般飼主新增的是自家貓；中途新增的是待領養貓 */
// 中途新增的貓先是「準備中」，前台看不到；中途按「準備出發找新主人」才公開（規格 09 §5，0017）
export const defaultCatStatus = (role: CaretakerType) => (role === "cat_owner" ? "own" : "preparing") as "own" | "preparing";

/** 中途徽章申請（沿用既有的認證審核表）；不需要申請時回傳 null */
export function verificationRow(f: HouseholdForm, ids: { householdId: string; userId: string }) {
  if (f.role === "shelter_org" || (f.role === "personal_foster" && f.applyBadge)) {
    const org = f.role === "shelter_org";
    return {
      household_id: ids.householdId,
      applicant_id: ids.userId,
      org_type: f.role,
      org_name: org ? f.orgName.trim() : null,
      proof_url: org ? f.orgProofUrl.trim() : null,
      description: org ? `立案單位「${f.orgName.trim()}」建立喵戶時一併申請中途徽章。` : "個人中途建立喵戶時一併申請中途徽章。",
    };
  }
  return null;
}

/** 喵戶數量上限：null 表示不限制（開發期間，#82）；之後要限制改 meow_site_settings 的 household_limit */
export const canAddHousehold = (existing: number, limit: number | null) => limit === null || existing < limit;

/** meow_site_settings.household_limit 的值 → 上限；不是正整數就當作不限制 */
export const parseHouseholdLimit = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

/** 修改喵戶：資料庫一筆 → 表單；舊資料缺的欄位用預設值 */
export function fromHouseholdRow(r: {
  name: string; caretaker_type: CaretakerType; city: string | null; district: string | null; intro: string | null;
  home: Partial<Home> | Record<string, unknown> | null; adoption_terms: AdoptionTerms | null; org_name: string | null; org_proof_url: string | null;
  /** meow_household_budgets.monthly_twd（0025）；沒填過是 null */
  budget?: number | null;
}): HouseholdForm {
  const empty = emptyHouseholdForm();
  const home = HomeSchema.safeParse({ ...empty.home, ...(r.home ?? {}) });
  const terms = AdoptionTermsSchema.safeParse(r.adoption_terms);
  return {
    ...empty,
    role: r.caretaker_type,
    name: r.name,
    city: r.city,
    district: r.district ?? "",
    intro: r.intro ?? "",
    home: home.success ? home.data : empty.home,
    terms: r.adoption_terms && terms.success ? terms.data : null,
    orgName: r.org_name ?? "",
    orgProofUrl: r.org_proof_url ?? "",
    budget: r.budget ? String(r.budget) : "",
  };
}

/** 修改喵戶：身分建立後不能改（資料庫 trigger 也會擋），所以不送 caretaker_type */
export function toHouseholdUpdate(f: HouseholdForm) {
  const row: Partial<ReturnType<typeof toHouseholdRow>> = toHouseholdRow(f);
  delete row.caretaker_type;
  return row;
}
