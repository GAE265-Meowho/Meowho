import { describe, expect, it } from "vitest";
import { canAddHousehold, checkHousehold, defaultCatStatus, emptyHouseholdForm, toHouseholdRow, verificationRow, type HouseholdForm } from "./household-rules";

const base = (o: Partial<HouseholdForm>): HouseholdForm => ({ ...emptyHouseholdForm(), city: "台中市", district: "北屯", ...o });

describe("依身分建立喵戶：必填欄位", () => {
  it("沒選身分不能建立", () => {
    expect(checkHousehold(base({}))).toContain("role");
  });

  it("一般飼主：要填住家型態，名稱可以留空", () => {
    expect(checkHousehold(base({ role: "cat_owner" }))).toEqual(["dwelling"]);
    expect(checkHousehold(base({ role: "cat_owner", home: { ...emptyHouseholdForm().home, dwelling: "apartment" } }))).toEqual([]);
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

  it("縣市、區每種身分都必填", () => {
    expect(checkHousehold({ ...base({ role: "personal_foster", name: "小橘之家" }), city: null, district: "" })).toEqual(["city", "district"]);
  });
});

describe("寫入資料庫的格式", () => {
  it("一般飼主名稱留空時用「〇〇的家」，貓預設自家貓", () => {
    const row = toHouseholdRow(base({ role: "cat_owner", home: { ...emptyHouseholdForm().home, dwelling: "house", renting: true, landlordOk: true } }), "黃子哲");
    expect(row).toMatchObject({ name: "黃子哲的家", caretaker_type: "cat_owner", city: "台中市", district: "北屯區", adoption_terms: null });
    expect(row.home).toMatchObject({ dwelling: "house", renting: true, landlordOk: true });
    expect(defaultCatStatus("cat_owner")).toBe("own");
  });

  it("沒有顯示名稱時叫「我的家」", () => {
    expect(toHouseholdRow(base({ role: "cat_owner", home: { ...emptyHouseholdForm().home, dwelling: "house" } }), null).name).toBe("我的家");
  });

  it("中途：存預設送養條件、不存居住環境，貓預設待領養", () => {
    const row = toHouseholdRow(base({ role: "personal_foster", name: "小橘之家", terms: { items: ["不放養", "家訪"], note: "" } }), "子哲");
    expect(row).toMatchObject({ name: "小橘之家", home: null, adoption_terms: { items: ["不放養", "家訪"], note: "" }, org_name: null });
    expect(defaultCatStatus("personal_foster")).toBe("adoptable");
    expect(defaultCatStatus("shelter_org")).toBe("adoptable");
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
