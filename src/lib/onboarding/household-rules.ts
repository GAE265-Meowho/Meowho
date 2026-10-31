// 依身分建立喵戶（#82）：一般飼主的喵戶是「自己的家」，中途的喵戶是「送養據點」。
// 純函式，畫面與測試共用。位置只存到縣市＋區（AGENTS.md §6）。
import { AdoptionTermsSchema, type AdoptionTerms } from "../cat-profile/adoption";
import { cleanName, parseDistrict, type CaretakerType } from "./household";
import { z } from "zod";

export const ROLE_INFO: Record<CaretakerType, { label: string; hint: string }> = {
  cat_owner: { label: "一般飼主", hint: "準備領養，或家裡已經有貓" },
  personal_foster: { label: "個人中途", hint: "自己照顧、送養浪貓" },
  shelter_org: { label: "立案協會／收容單位", hint: "有立案的協會或收容單位" },
};
export const ROLES = Object.keys(ROLE_INFO) as CaretakerType[];

export const DWELLINGS = { apartment: "公寓", building: "電梯大樓", house: "透天", other: "其他" } as const;
export const FAMILY = ["小孩", "長輩", "室友"] as const;
export const PETS = ["貓", "狗", "其他動物"] as const;
export const SCREENS = { all: "都有裝", partial: "部分有裝", none: "還沒裝" } as const;

export const HomeSchema = z.object({
  dwelling: z.enum(Object.keys(DWELLINGS) as [keyof typeof DWELLINGS]).nullable(),
  renting: z.boolean().nullable(),
  landlordOk: z.boolean().nullable(),
  family: z.array(z.enum(FAMILY)),
  pets: z.array(z.enum(PETS)),
  screens: z.enum(Object.keys(SCREENS) as [keyof typeof SCREENS]).nullable(),
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
}

export const emptyHouseholdForm = (): HouseholdForm => ({
  role: null, name: "", city: null, district: "", intro: "",
  home: { dwelling: null, renting: null, landlordOk: null, family: [], pets: [], screens: null },
  terms: null, orgName: "", orgProofUrl: "", applyBadge: false,
});

export type MissingField = "role" | "name" | "city" | "district" | "dwelling" | "orgName" | "orgProofUrl";

/** 寫「北屯區」或只寫「北屯」都可以 */
export function normalizeDistrict(city: string | null, typed: string): string | null {
  const t = typed.trim();
  if (!city || !t) return null;
  return parseDistrict(`${city}${t}`, city) ?? (t.length >= 2 ? `${t}區` : null);
}

const isUrl = (s: string) => /^https?:\/\/\S+\.\S+/.test(s.trim());

export function checkHousehold(f: HouseholdForm): MissingField[] {
  const miss: MissingField[] = [];
  if (!f.role) miss.push("role");
  if (f.role && f.role !== "cat_owner" && cleanName(f.name).length < 2) miss.push("name");
  if (!f.city) miss.push("city");
  if (!normalizeDistrict(f.city, f.district)) miss.push("district");
  if (f.role === "cat_owner" && !f.home.dwelling) miss.push("dwelling");
  if (f.role === "shelter_org") {
    if (!f.orgName.trim()) miss.push("orgName");
    if (!isUrl(f.orgProofUrl)) miss.push("orgProofUrl");
  }
  return miss;
}

/** 一般飼主名稱留空時的預設名稱 */
export const defaultHomeName = (displayName: string | null) =>
  displayName?.trim() ? `${Array.from(displayName.trim()).slice(0, 27).join("")}的家` : "我的家";

export function toHouseholdRow(f: HouseholdForm, displayName: string | null) {
  const owner = f.role === "cat_owner";
  const name = cleanName(f.name);
  return {
    name: owner && name.length < 2 ? defaultHomeName(displayName) : name,
    caretaker_type: f.role,
    city: f.city,
    district: normalizeDistrict(f.city, f.district),
    intro: f.intro.trim(),
    allow_stranger_messages: true,
    default_visibility: "public" as const,
    home: owner ? HomeSchema.parse(f.home) : null,
    adoption_terms: owner || !f.terms ? null : AdoptionTermsSchema.parse(f.terms),
    org_name: f.role === "shelter_org" ? f.orgName.trim() : null,
    org_proof_url: f.role === "shelter_org" ? f.orgProofUrl.trim() : null,
  };
}

/** 一般飼主新增的是自家貓；中途新增的是待領養貓 */
export const defaultCatStatus = (role: CaretakerType) => (role === "cat_owner" ? "own" : "adoptable") as "own" | "adoptable";

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
