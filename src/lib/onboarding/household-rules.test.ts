import { describe, expect, it } from "vitest";
import { canAddHousehold, checkHousehold, defaultCatStatus, emptyHouseholdForm, fromHouseholdRow, toHouseholdRow, toHouseholdUpdate, verificationRow, type HouseholdForm } from "./household-rules";

const base = (o: Partial<HouseholdForm>): HouseholdForm => ({ ...emptyHouseholdForm(), city: "台中市", district: "北屯區", ...o });

describe("依身分建立喵戶：必填欄位", () => {
  it("沒選身分不能建立", () => {
    expect(checkHousehold(base({}))).toContain("role");
  });

  it("一般飼主：名稱與住家型態必填", () => {
    expect(checkHousehold(base({ role: "cat_owner" }))).toEqual(["name", "dwelling"]);
    expect(checkHousehold(base({ role: "cat_owner", name: "子哲的家", home: { ...emptyHouseholdForm().home, dwelling: "apartment" } }))).toEqual([]);
  });

  it("同一個帳號裡喵戶名稱不能重複（忽略前後空白與大小寫）", () => {
    const f = base({ role: "personal_foster", name: " 小橘之家 " });
    expect(checkHousehold(f, ["小橘之家"])).toEqual(["nameTaken"]);
    expect(checkHousehold(base({ role: "personal_foster", name: "Cat Home" }), ["cat home"])).toEqual(["nameTaken"]);
    expect(checkHousehold(f, ["大橘之家"])).toEqual([]);
  });

  it("個人中途：要填名稱", () => {
    expect(checkHousehold(base({ role: "personal_foster" }))).toEqual(["name"]);
    expect(checkHousehold(base({ role: "personal_foster", name: "小橘之家" }))).toEqual([]);
  });

  it("立案中途：要填名稱、單位名稱、立案證明連結（網址）", () => {
    expect(checkHousehold(base({ role: "shelter_org", name: "貓之家" }))).toEqual(["orgName", "orgProofUrl"]);
    expect(checkHousehold(base({ role: "shelter_org", name: "貓之家", orgName: "台中貓協會", orgProofUrl: "不是網址" }))).toEqual(["orgProofUrl"]);
    expect(checkHousehold(base({ role: "shelter_org", name: "貓之家", orgName: "台中貓協會", orgProofUrl: "https://example.org" }))).toEqual([]);
  });

  it("區要從該縣市的清單選", () => {
    expect(checkHousehold(base({ role: "personal_foster", name: "小橘之家", district: "信義區" }))).toEqual(["district"]);
    expect(checkHousehold(base({ role: "personal_foster", name: "小橘之家", city: "新竹市", district: "香山區" }))).toEqual([]);
  });

  it("縣市、區每種身分都必填", () => {
    expect(checkHousehold({ ...base({ role: "personal_foster", name: "小橘之家" }), city: null, district: "" })).toEqual(["city", "district"]);
  });
});

describe("寫入資料庫的格式", () => {
  it("一般飼主：存居住環境，貓預設自家貓", () => {
    const row = toHouseholdRow(base({ role: "cat_owner", name: "子哲的家", home: { ...emptyHouseholdForm().home, dwelling: "house", living: "rent" } }));
    expect(row).toMatchObject({ name: "子哲的家", caretaker_type: "cat_owner", city: "台中市", district: "北屯區", adoption_terms: null });
    expect(row.home).toMatchObject({ dwelling: "house", living: "rent" });
    expect(defaultCatStatus("cat_owner")).toBe("own");
  });

  it("中途：存預設送養條件、不存居住環境，貓預設準備中（規格 09 §5）", () => {
    const row = toHouseholdRow(base({ role: "personal_foster", name: "小橘之家", terms: { items: ["不放養", "家訪"], note: "" } }));
    expect(row).toMatchObject({ name: "小橘之家", home: null, adoption_terms: { items: ["不放養", "家訪"], note: "" }, org_name: null });
    expect(defaultCatStatus("personal_foster")).toBe("preparing");
    expect(defaultCatStatus("shelter_org")).toBe("preparing");
  });
});

describe("一般飼主的「其他」可以自由填寫", () => {
  it("選了「其他」才存補充文字", () => {
    const home = { ...emptyHouseholdForm().home, dwelling: "other" as const, dwellingOther: "貨櫃屋", family: ["其他" as const], familyOther: "阿姨", pets: ["貓" as const], petsOther: "鸚鵡" };
    const row = toHouseholdRow(base({ role: "cat_owner", name: "子哲的家", home }));
    expect(row.home).toMatchObject({ dwelling: "other", dwellingOther: "貨櫃屋", familyOther: "阿姨", petsOther: "" });
  });
});

describe("中途徽章申請", () => {
  it("立案中途建立時一定會送出申請", () => {
    const f = base({ role: "shelter_org", name: "貓之家", orgName: "台中貓協會", orgProofUrl: "https://example.org" });
    expect(verificationRow(f, { householdId: "h1", userId: "u1" })).toMatchObject({
      household_id: "h1", applicant_id: "u1", org_type: "shelter_org", org_name: "台中貓協會", proof_url: "https://example.org",
    });
  });

  it("個人中途只有勾選時才送出；一般飼主不送", () => {
    const f = base({ role: "personal_foster", name: "小橘之家" });
    expect(verificationRow(f, { householdId: "h1", userId: "u1" })).toBeNull();
    expect(verificationRow({ ...f, applyBadge: true }, { householdId: "h1", userId: "u1" })?.org_type).toBe("personal_foster");
    expect(verificationRow(base({ role: "cat_owner", applyBadge: true }), { householdId: "h1", userId: "u1" })).toBeNull();
  });

  it("申請說明至少 10 個字（資料表限制）", () => {
    const row = verificationRow(base({ role: "shelter_org", name: "貓", orgName: "協會", orgProofUrl: "https://a.b" }), { householdId: "h", userId: "u" });
    expect(Array.from(row!.description).length).toBeGreaterThanOrEqual(10);
  });
});

describe("喵戶數量上限", () => {
  it("開發期間不限制（上限為 null）", () => {
    expect(canAddHousehold(50, null)).toBe(true);
  });
  it("設定上限後擋下", () => {
    expect(canAddHousehold(2, 2)).toBe(false);
    expect(canAddHousehold(1, 2)).toBe(true);
  });
});

describe("修改喵戶", () => {
  const row = {
    name: "麥麥之家", caretaker_type: "personal_foster" as const, city: "桃園市", district: "龍潭區", intro: "個人中途三年",
    home: null, adoption_terms: { items: ["家訪" as const], note: "" }, org_name: null, org_proof_url: null,
  };

  it("資料庫一筆 → 表單，舊資料缺的居住環境欄位用預設值", () => {
    const f = fromHouseholdRow(row);
    expect(f).toMatchObject({ role: "personal_foster", name: "麥麥之家", city: "桃園市", district: "龍潭區", intro: "個人中途三年", terms: { items: ["家訪"], note: "" } });
    const owner = fromHouseholdRow({ ...row, caretaker_type: "cat_owner", home: { dwelling: "house", renting: true } });
    expect(owner.home).toMatchObject({ dwelling: "house", living: null, family: [], petsOther: "" });
  });

  it("更新時不改身分", () => {
    expect(toHouseholdUpdate(fromHouseholdRow(row))).not.toHaveProperty("caretaker_type");
  });

  it("改名時不跟自己比重複", () => {
    expect(checkHousehold(fromHouseholdRow(row), ["麥麥之家", "大橘之家"].filter(n => n !== row.name))).toEqual([]);
  });
});
