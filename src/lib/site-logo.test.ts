// 網站 Logo 設定值解析（Issue #23）：內建代號或上傳檔案的公開網址
import { describe, expect, it } from "vitest";
import { resolveSiteLogo } from "./site-logo";

describe("resolveSiteLogo", () => {
  it("內建代號 → 對應的內建 Logo", () => expect(resolveSiteLogo("round")).toMatchObject({ id: "round", src: "/logos/logo-round.jpg", kind: "builtin" }));
  it("上傳檔案的 https 網址 → 直接使用", () => {
    const url = "https://x.supabase.co/storage/v1/object/public/meow-site-assets/logos/1-a.png";
    expect(resolveSiteLogo(url)).toMatchObject({ src: url, kind: "upload", name: "上傳的 Logo" });
  });
  it("沒有設定、未知代號、非字串、非 https → 預設第一款", () => {
    for (const v of [null, undefined, "unknown", 123, "javascript:alert(1)", "http://insecure.example/a.png", ""]) {
      expect(resolveSiteLogo(v)).toMatchObject({ id: "house", kind: "builtin" });
    }
  });
});
