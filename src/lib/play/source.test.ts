import { describe, expect, it } from "vitest";
import { playCatLook } from "./cats";
import { demoPlayCat, loadPlayCat } from "./source";

describe("領養任務的貓咪來源", () => {
  it("讀不到資料（沒設定 Supabase）時回 DEMO 麻糬，並記下網址上的貓咪 id", async () => {
    const cat = await loadPlayCat("cat-123");
    expect(cat).toMatchObject({ catId: "cat-123", name: "麻糬", coat: "虎斑", demo: true, adoptable: true, tabby: true, months: null });
  });

  it("DEMO 的 3D 外觀和原本的示範模型一樣", () => {
    const cat = demoPlayCat("x");
    expect(cat.look("kitten")).toEqual(playCatLook("kitten"));
    expect(cat.look("adult")).toEqual(playCatLook("adult"));
  });
});
