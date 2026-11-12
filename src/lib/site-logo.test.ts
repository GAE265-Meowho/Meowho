// 網站 Logo 設定值解析（Issue #23）：內建代號或上傳檔案的公開網址
import { describe, expect, it } from "vitest";
import { resolveSiteLogo } from "./site-logo";

describe("resolveSiteLogo", () => {
  it("內建代號 → 對應的內建 Logo", () => expect(resolveSiteLogo("round")).toMatchObject({ id: "round", src: "/logos/logo-round.jpg", kind: "builtin" }));
  it("#361 門口貓頭：方形用符號、橫式用組合版", () =>
    expect(resolveSiteLogo("door")).toMatchObject({ id: "door", src: "/logos/meowho-symbol.svg", wordmark: "/logos/meowho-horizontal-color.svg", kind: "builtin" }));
  it("#361 舊的三款都還在", () => {
    for (const id of ["house", "round", "line"]) expect(resolveSiteLogo(id)).toMatchObject({ id, kind: "builtin" });
  });
  it("上傳檔案的 https 網址 → 直接使用", () => {
    const url = "https://x.supabase.co/storage/v1/object/public/meow-site-assets/logos/1-a.png";
    expect(resolveSiteLogo(url)).toMatchObject({ src: url, kind: "upload", name: "上傳的 Logo" });
  });
  it("沒有設定、未知代號、非字串、非 https → 預設門口貓頭（#361）", () => {
    for (const v of [null, undefined, "unknown", 123, "javascript:alert(1)", "http://insecure.example/a.png", ""]) {
      expect(resolveSiteLogo(v)).toMatchObject({ id: "door", kind: "builtin" });
    }
  });
});
