// Admin 授權模組的純函式（Issue #23）：授權矩陣差異、Logo 檔案檢查、上傳路徑
import { describe, expect, it } from "vitest";
import { diffGrants, logoStoragePath, validateLogoFile } from "./admin-auth";

describe("diffGrants 授權矩陣差異", () => {
  it("只列出有變動的授予與撤銷", () => {
    const before = { a: ["products", "knowledge"], b: [] };
    const after = { a: ["products", "user_management"], b: ["knowledge"] };
    expect(diffGrants(before, after)).toEqual({
      grants: [{ adminId: "a", module: "user_management" }, { adminId: "b", module: "knowledge" }],
      revokes: [{ adminId: "a", module: "knowledge" }],
    });
  });
  it("沒有變動回傳空陣列", () => expect(diffGrants({ a: ["products"] }, { a: ["products"] })).toEqual({ grants: [], revokes: [] }));
  it("忽略不可授予的 Admin 授權模組", () => {
    expect(diffGrants({ a: [] }, { a: ["admin_authorization"] })).toEqual({ grants: [], revokes: [] });
  });
  it("依模組固定順序輸出", () => {
    expect(diffGrants({ a: [] }, { a: ["virtual_assets", "report_moderation"] }).grants.map(g => g.module)).toEqual(["report_moderation", "virtual_assets"]);
  });
});

describe("validateLogoFile", () => {
  it("PNG／JPG／SVG／WebP 且 ≤ 1 MB 可上傳", () => {
    for (const type of ["image/png", "image/jpeg", "image/svg+xml", "image/webp"]) expect(validateLogoFile({ type, size: 1024 * 1024 }).ok).toBe(true);
  });
  it("超過 1 MB 不行", () => expect(validateLogoFile({ type: "image/png", size: 1024 * 1024 + 1 })).toEqual({ ok: false, message: "檔案不能超過 1 MB" }));
  it("其他格式不行", () => expect(validateLogoFile({ type: "image/gif", size: 10 })).toEqual({ ok: false, message: "只接受 PNG、JPG、SVG、WebP" }));
  it("空檔不行", () => expect(validateLogoFile({ type: "image/png", size: 0 }).ok).toBe(false));
});

describe("logoStoragePath", () => {
  it("logos/<時間戳>-<安全檔名>，保留副檔名、去掉空白與特殊字元", () => {
    expect(logoStoragePath("我的 Logo (新).PNG", new Date(1761700000000))).toBe("logos/1761700000000-logo.png");
    expect(logoStoragePath("meow-home_v2.svg", new Date(1))).toBe("logos/1-meow-home_v2.svg");
  });
  it("檔名全是特殊字元時用 logo", () => expect(logoStoragePath("貓.webp", new Date(5))).toBe("logos/5-logo.webp"));
});
