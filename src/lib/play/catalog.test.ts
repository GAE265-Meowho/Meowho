// 虛擬飼養：後台「生活用品」（meow_items）→ 遊戲的價格、選項、模型。後台有就用後台，沒有就沿用程式裡寫的（costs.ts、items.ts）。
import { describe, expect, it } from "vitest";
import { playShop, toPlayCatalog } from "./catalog";

const url = (p: string) => `https://x.test/${p}`;
const row = (name: string, cat: string | null, price: number | null, path = `${name}/model.glb`, dims: [number, number, number] | null = [0.3, 0.5, 0.3]) => ({
  name, price_twd: price, model_path: path,
  width_m: dims?.[0] ?? null, depth_m: dims?.[1] ?? null, height_m: dims?.[2] ?? null,
  meow_item_categories: cat ? { name: cat } : null,
});
const rows = [
  row("老鼠", "逗貓棒", 15, "mouse/model.glb", [0.054, 0.024, 0.028]),
  row("外出籠", "外出籠", null, "carrier/model.glb", [0.33, 0.51, 0.31]),
  row("直立式貓抓台", "貓抓板", 1199),
  row("貓砂盆", "貓砂盆", 1127),
  row("餐碗組", "餐碗水碗", 399),
  row("沒有類別", null, 50),
];

describe("toPlayCatalog", () => {
  it("沒有類別的略過；模型網址由 publicUrl 組出；價格不是正數當成沒有", () => {
    const c = toPlayCatalog([...rows, row("x", "貓抓板", -5), row("y", "貓抓板", Number.NaN)], url);
    expect(c).toHaveLength(7);
    expect(c.find(i => i.name === "老鼠")).toMatchObject({ categoryName: "逗貓棒", priceTwd: 15, modelUrl: "https://x.test/mouse/model.glb", widthM: 0.054 });
    expect(c.find(i => i.name === "x")?.priceTwd).toBeNull();
    expect(c.find(i => i.name === "y")?.priceTwd).toBeNull();
  });
  it("只回傳遊戲要用的欄位", () => {
    expect(Object.keys(toPlayCatalog(rows, url)[0]).sort()).toEqual(["categoryName", "depthM", "heightM", "modelUrl", "name", "priceTwd", "widthM"]);
  });
});

describe("playShop（後台有就用後台）", () => {
  const shop = playShop(toPlayCatalog(rows, url));
  it("貓抓板、逗貓棒：用後台價格", () => {
    expect(shop.flags).toEqual({ scratcher: 1199, toy: 15 });
  });
  it("砂盆、碗：後台有品項就改用後台的品名與價格當選項", () => {
    expect(shop.opts.box).toEqual([["貓砂盆", 1127]]);
    expect(shop.opts.bowls).toEqual([["餐碗組", 399]]);
  });
  it("後台之後補上傳更多品項，選項自動變多（價格由低到高）", () => {
    const more = playShop(toPlayCatalog([...rows, row("有蓋貓砂盆", "貓砂盆", 900), row("飲水機", "餐碗水碗", 1500)], url));
    expect(more.opts.box).toEqual([["有蓋貓砂盆", 900], ["貓砂盆", 1127]]);
    expect(more.opts.bowls).toEqual([["餐碗組", 399], ["飲水機", 1500]]);
  });
  it("同類多個貓抓板、逗貓棒時取最便宜的", () => {
    expect(playShop(toPlayCatalog([row("a", "貓抓板", 500), row("b", "貓抓板", 300)], url)).flags).toEqual({ scratcher: 300 });
  });
  it("後台沒有（或沒填價格）的類別不出現，遊戲沿用程式裡的原版估價", () => {
    expect(playShop([])).toEqual({ flags: {}, opts: {}, models: {} });
    const none = playShop(toPlayCatalog([row("老鼠", "逗貓棒", null), row("貓砂盆", "貓砂盆", null)], url));
    expect(none.flags).toEqual({});
    expect(none.opts).toEqual({});
  });
  it("擺放用的模型：外出籠、餐碗、貓砂盆有網址與公尺尺寸才採用；尺寸缺一個就不用（避免模型變巨大或消失）", () => {
    expect(shop.models?.carrier).toEqual({ url: "https://x.test/carrier/model.glb", widthM: 0.33, depthM: 0.51, heightM: 0.31 });
    expect(shop.models?.toy).toEqual({ url: "https://x.test/mouse/model.glb", widthM: 0.054, depthM: 0.024, heightM: 0.028 });
    expect(shop.models?.bowl?.url).toBe("https://x.test/餐碗組/model.glb");
    expect(shop.models?.litter_box?.url).toBe("https://x.test/貓砂盆/model.glb");
    expect(playShop(toPlayCatalog([row("外出籠", "外出籠", null, "c/model.glb", null)], url)).models?.carrier).toBeUndefined();
  });

  it("尺寸填錯的迷你用品不採用：最便宜的貓砂盆只有 13 公分，改用同類下一個；全部都太小就沿用程式裡寫的", () => {
    const tiny = row("便宜貓砂盆", "貓砂盆", 55, "tiny/model.glb", [0.131, 0.114, 0.027]);
    const ok = row("貓砂盆", "貓砂盆", 1127, "box/model.glb", [0.341, 0.506, 0.379]);
    expect(playShop(toPlayCatalog([tiny, ok], url)).models?.litter_box).toEqual({ url: "https://x.test/box/model.glb", widthM: 0.341, depthM: 0.506, heightM: 0.379 });
    expect(playShop(toPlayCatalog([tiny], url)).models?.litter_box).toBeUndefined();
    // 逗貓棒本來就小，不受限
    expect(playShop(toPlayCatalog([row("老鼠", "逗貓棒", 15, "mouse/model.glb", [0.054, 0.024, 0.028])], url)).models?.toy?.widthM).toBe(0.054);
  });
});
