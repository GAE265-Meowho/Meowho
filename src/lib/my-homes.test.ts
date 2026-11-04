import { describe, expect, it } from "vitest";
import { catsForTab, homeAvatar, householdAvatarPath, tabsFor } from "./my-homes";

describe("喵戶的分頁", () => {
  it("中途和一般飼主的分頁與圖示不同", () => {
    expect(tabsFor("personal_foster").map(t => `${t.label}:${t.icon}`)).toEqual(["待領養貓:cat", "還在準備:yarn"]);
    expect(tabsFor("shelter_org").map(t => t.key)).toEqual(["adoptable", "preparing"]);
    expect(tabsFor("cat_owner").map(t => `${t.label}:${t.icon}`)).toEqual(["我的貓:house", "收藏貓:heart"]);
  });
  it("中途：準備中的貓放「還在準備」，其他放「待領養貓」；一般飼主的貓都在「我的貓」", () => {
    const cats = [{ id: "a", status: "adoptable" }, { id: "b", status: "preparing" }, { id: "c", status: "own" }];
    expect(catsForTab(cats, "adoptable").map(c => c.id)).toEqual(["a", "c"]);
    expect(catsForTab(cats, "preparing").map(c => c.id)).toEqual(["b"]);
    expect(catsForTab(cats, "mine").map(c => c.id)).toEqual(["a", "b", "c"]);
    expect(catsForTab(cats, "favorites")).toEqual([]);
  });
});

describe("喵戶頭像", () => {
  const url = (p: string) => `https://cdn.example/${p}`;
  it("有上傳用喵戶頭像，沒有用 Google 頭像，都沒有就是 null", () => {
    expect(homeAvatar("u1/households/x.jpg", "https://google/a.png", url)).toBe("https://cdn.example/u1/households/x.jpg");
    expect(homeAvatar(null, "https://google/a.png", url)).toBe("https://google/a.png");
    expect(homeAvatar(null, "", url)).toBeNull();
  });
  it("存在喵戶長自己的資料夾（meow-cat-photos 的 policy 只讓本人寫）", () => {
    expect(householdAvatarPath("u1", "f1")).toBe("u1/households/f1.jpg");
  });
});
