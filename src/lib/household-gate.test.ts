import { describe, expect, it } from "vitest";
import { afterHousehold, guideUrl, needsGuide, safeNext, takeIntent, withIntent } from "./household-gate";

describe("登入後回到原本那一步（規格 09 §2、§7.1）", () => {
  it("只接受站內路徑", () => {
    expect(safeNext("/cats/abc?do=fav")).toBe("/cats/abc?do=fav");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
  it("引導建立喵戶的網址帶著原本那一步", () => {
    expect(guideUrl("/cats/abc?do=fav")).toBe("/onboarding?guide=1&next=%2Fcats%2Fabc%3Fdo%3Dfav");
  });
  it("原本那一步可以記下要自動接著做的動作，再取出並從網址拿掉", () => {
    const next = withIntent("/cats/abc?x=1", "fav");
    expect(next).toBe("/cats/abc?x=1&do=fav");
    expect(takeIntent(`https://meowho.vercel.app${next}`)).toEqual({ intent: "fav", clean: "/cats/abc?x=1" });
    expect(takeIntent("https://meowho.vercel.app/cats/abc")).toEqual({ intent: null, clean: "/cats/abc" });
    expect(takeIntent("https://meowho.vercel.app/cats/abc?do=hack").intent).toBeNull();
  });
});

describe("登入後要不要先引導建立喵戶", () => {
  it("沒有喵戶就引導；有喵戶、或本來就要去建立喵戶的不用", () => {
    expect(needsGuide({ homes: 0, next: "/cats/abc" })).toBe(true);
    expect(needsGuide({ homes: 1, next: "/cats/abc" })).toBe(false);
    expect(needsGuide({ homes: 0, next: "/onboarding?new=1" })).toBe(false);
  });
});

describe("喵戶建好後的兩個下一步", () => {
  it("建立我家的 3D 房間；先逛逛貓咪回到原本那一步", () => {
    expect(afterHousehold("h1", "/cats/abc?do=msg")).toEqual({ room: "/homes/h1/scene?next=%2Fcats%2Fabc%3Fdo%3Dmsg", browse: "/cats/abc?do=msg" });
  });
  it("沒有原本那一步：先逛逛貓咪到首頁的待領養貓", () => {
    expect(afterHousehold("h1", null)).toEqual({ room: "/homes/h1/scene", browse: "/#adopt" });
  });
});
