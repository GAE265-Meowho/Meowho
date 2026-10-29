// 用戶權限管理的資料整理（T-HQ-10，Issue #24）
import { describe, expect, it } from "vitest";
import {
  buildUserViews, deriveIdentity, filterUsers, filterVerifications, USER_FILTERS,
  type HouseholdRow, type ProfileRow, type SuspensionRow, type VerificationRow,
} from "./users";

const now = new Date("2026-10-29T04:00:00Z");
const p = (id: string, extra: Partial<ProfileRow> = {}): ProfileRow => ({ id, email: `${id}@x.com`, display_name: id.toUpperCase(), role: "member", created_at: "2026-10-01T00:00:00Z", ...extra });
const h = (id: string, owner: string, extra: Partial<HouseholdRow> = {}): HouseholdRow => ({ id, owner_id: owner, name: `家${id}`, city: "台中市", district: "西屯區", verified_shelter: false, ...extra });

describe("deriveIdentity", () => {
  it("有貓戶＝貓戶長，沒有＝貓友", () => {
    expect(deriveIdentity(0)).toBe("cat_friend");
    expect(deriveIdentity(2)).toBe("household_owner");
  });
});

describe("buildUserViews", () => {
  const profiles = [p("cf"), p("ho"), p("ad", { role: "admin" }), p("sus"), p("ban")];
  const households = [h("1", "ho"), h("2", "ho", { verified_shelter: true }), h("3", "ad")];
  const suspensions: SuspensionRow[] = [
    { user_id: "sus", reason: "詐騙", suspended_at: "2026-10-20T00:00:00Z", suspended_until: null, lifted_at: null },
    { user_id: "cf", reason: "過期", suspended_at: "2026-10-01T00:00:00Z", suspended_until: "2026-10-08T00:00:00Z", lifted_at: null },
  ];
  const bans = [{ google_email: "ban@x.com", auth_user_id: "ban", lifted_at: null }];
  const views = buildUserViews(profiles, households, suspensions, bans, now);
  const byId = Object.fromEntries(views.map(v => [v.id, v]));

  it("貓戶長列出所有貓戶（最多 2 個）", () => {
    expect(byId.ho.identity).toBe("household_owner");
    expect(byId.ho.households.map(x => x.id)).toEqual(["1", "2"]);
  });
  it("管理員同時可以是貓戶長（後台角色與前台身分各自獨立）", () => {
    expect(byId.ad.role).toBe("admin");
    expect(byId.ad.identity).toBe("household_owner");
  });
  it("狀態：生效中的停權＝停權中；已過期＝正常；黑名單優先", () => {
    expect(byId.sus.status).toBe("suspended");
    expect(byId.sus.suspension?.reason).toBe("詐騙");
    expect(byId.cf.status).toBe("normal");
    expect(byId.cf.suspension).toBeNull();
    expect(byId.ban.status).toBe("banned");
  });
  it("黑名單以 auth_user_id 或 Email 比對", () => {
    const v = buildUserViews([p("z", { email: "Z@X.com" })], [], [], [{ google_email: "z@x.com", auth_user_id: null, lifted_at: null }], now);
    expect(v[0].status).toBe("banned");
  });
  it("已移出黑名單不算", () => {
    const v = buildUserViews([p("z")], [], [], [{ google_email: "z@x.com", auth_user_id: "z", lifted_at: "2026-10-10T00:00:00Z" }], now);
    expect(v[0].status).toBe("normal");
  });
});

describe("filterUsers", () => {
  const views = buildUserViews(
    [p("cf"), p("ho"), p("ad", { role: "admin", display_name: "小管" }), p("sa", { role: "system_admin" })],
    [h("1", "ho")],
    [{ user_id: "cf", reason: "x", suspended_at: "2026-10-20T00:00:00Z", suspended_until: null, lifted_at: null }],
    [], now,
  );
  const ids = (f: Parameters<typeof filterUsers>[1]) => filterUsers(views, f).map(v => v.id);
  it("篩選身分與狀態", () => {
    expect(ids({ status: "cat_friend" })).toEqual(["cf", "ad", "sa"]);
    expect(ids({ status: "household_owner" })).toEqual(["ho"]);
    expect(ids({ status: "admin" })).toEqual(["ad", "sa"]);
    expect(ids({ status: "suspended" })).toEqual(["cf"]);
  });
  it("搜尋名稱或 Email（不分大小寫）", () => {
    expect(ids({ q: "小管" })).toEqual(["ad"]);
    expect(ids({ q: "HO@X" })).toEqual(["ho"]);
  });
  it("篩選選項包含身分與狀態", () => expect(USER_FILTERS.map(f => f.value)).toEqual(["cat_friend", "household_owner", "admin", "suspended", "banned"]));
});

describe("filterVerifications", () => {
  const v = (id: string, status: VerificationRow["status"], created: string, name = "家"): VerificationRow => ({
    id, household_id: `h${id}`, applicant_id: "u", org_type: "personal_foster", org_name: null, proof_url: null,
    description: "說明說明說明說明說明", status, review_note: null, created_at: created, reviewed_at: null,
    household: { name, city: "台北市", district: "大安區", verified_shelter: status === "approved" },
  });
  const rows = [v("a", "pending", "2026-10-20T00:00:00Z"), v("b", "pending", "2026-10-02T00:00:00Z", "貓之家"), v("c", "approved", "2026-10-25T00:00:00Z")];
  it("待審：等最久的在前", () => expect(filterVerifications(rows, { status: "pending" }).map(r => r.id)).toEqual(["b", "a"]));
  it("全部：最新的在前", () => expect(filterVerifications(rows, {}).map(r => r.id)).toEqual(["c", "a", "b"]));
  it("搜尋貓戶名稱", () => expect(filterVerifications(rows, { q: "貓之" }).map(r => r.id)).toEqual(["b"]));
});
