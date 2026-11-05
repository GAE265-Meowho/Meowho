import { describe, expect, it } from "vitest";
import { HQ_PAGE_META_PATHS, resolvePageMetaKey } from "./page-meta-map";

describe("resolvePageMetaKey", () => {
  it("側欄功能頁", () => {
    expect(resolvePageMetaKey("/MeowHQ")).toBe("home");
    expect(resolvePageMetaKey("/MeowHQ/")).toBe("home");
    expect(resolvePageMetaKey("/MeowHQ/households")).toBe("households");
    expect(resolvePageMetaKey("/MeowHQ/users")).toBe("users");
    expect(resolvePageMetaKey("/MeowHQ/reports")).toBe("reports");
    expect(resolvePageMetaKey("/MeowHQ/products")).toBe("products");
    expect(resolvePageMetaKey("/MeowHQ/knowledge")).toBe("knowledge");
  });

  it("assets 依 ?tab=；子路徑繼承", () => {
    expect(resolvePageMetaKey("/MeowHQ/assets")).toBe("assets/cats");
    expect(resolvePageMetaKey("/MeowHQ/assets", "tab=experience")).toBe("assets/experience");
    expect(resolvePageMetaKey("/MeowHQ/assets", "?tab=food")).toBe("assets/food");
    expect(resolvePageMetaKey("/MeowHQ/assets/cats/new")).toBe("assets/cats");
    expect(resolvePageMetaKey("/MeowHQ/assets/bases/adult")).toBe("assets/cats");
    expect(resolvePageMetaKey("/MeowHQ/assets/floorplans/room_1")).toBe("assets/rooms-floorplan");
  });

  it("admin 依 ?tab=", () => {
    expect(resolvePageMetaKey("/MeowHQ/admin")).toBe("admin/auth");
    expect(resolvePageMetaKey("/MeowHQ/admin", "tab=audit")).toBe("admin/audit");
    expect(resolvePageMetaKey("/MeowHQ/admin", "tab=settings")).toBe("admin/settings");
  });

  it("每個 key 都有 paths", () => {
    for (const [key, paths] of Object.entries(HQ_PAGE_META_PATHS)) {
      expect(paths.length, key).toBeGreaterThan(0);
    }
  });
});
