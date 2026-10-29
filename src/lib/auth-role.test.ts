import { describe, expect, it } from "vitest";
import { isAdminRole } from "./auth-role";

describe("isAdminRole（Auth.tsx 的 isAdmin，0002 執行前後都要正確）", () => {
  it("admin 與 system_admin 都算管理員", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("system_admin")).toBe(true);
  });
  it("一般會員、空值、未知角色都不算", () => {
    expect(isAdminRole("member")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole("owner")).toBe(false);
  });
});
