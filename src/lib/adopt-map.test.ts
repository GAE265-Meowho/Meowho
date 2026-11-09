import { describe, expect, it } from "vitest";
import { DISTRICTS } from "./geo/region-bounds";
import { TW_CITIES } from "./geo/tw-districts";
import {
  ADOPT_REGIONS, ACTION_KEYS, COAT_KEYS, MAP_SIZE,
  actionKey, anchorOf, coatKey, countByRegion, isOnLand, layoutCats, parseLocation, placeCats, previewTags, regionOf,
} from "./adopt-map";
import { cats } from "./cats";

describe("帶我回家地圖：地區", () => {
  it("二十二個縣市各屬一個地區，離島獨立標出", () => {
    const assigned = ADOPT_REGIONS.flatMap((r) => [...r.cities]);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect([...assigned].sort()).toEqual([...TW_CITIES].sort());
    expect(regionOf("臺北市")).toBe("north");
    expect(regionOf("台中市")).toBe("central");
    expect(regionOf("高雄市")).toBe("south");
    expect(regionOf("花蓮縣")).toBe("east");
    expect(regionOf("澎湖縣")).toBe("islands");
    expect(regionOf("金門縣")).toBe("islands");
    expect(regionOf("連江縣")).toBe("islands");
    expect(ADOPT_REGIONS.find((r) => r.id === "islands")?.note).toContain("連江");
  });

  it("位置只留縣市與行政區", () => {
    expect(parseLocation("台中市北屯區文心路一段100號")).toEqual({ city: "台中市", district: "北屯區" });
    expect(parseLocation("臺北市大安區")).toEqual({ city: "台北市", district: "大安區" });
    expect(parseLocation("澎湖縣馬公市")).toEqual({ city: "澎湖縣", district: "馬公市" });
    expect(parseLocation("花蓮縣")).toEqual({ city: "花蓮縣", district: "" });
    expect(parseLocation("文心路100號")).toBeNull();
  });
});

describe("帶我回家地圖：落點", () => {
  it("行政區界資料涵蓋台中的 29 個區", () => {
    expect(DISTRICTS.filter((item) => item.c === "台中市")).toHaveLength(29);
    expect(DISTRICTS.filter((item) => item.c === "澎湖縣").map((item) => item.n)).toContain("馬公市");
  });

  it("縣市與手繪行政區都在該區陸地或離島框裡", () => {
    const outside: string[] = [];
    for (const region of ADOPT_REGIONS) {
      for (const city of region.cities) {
        // 新北市形狀很凹，縣市代表點可能落在界線中間的空隙
        if (city === "新北市") continue;
        const at = anchorOf(city, "")!;
        if (!isOnLand(region.id, at.lat, at.lng, city)) outside.push(city);
      }
    }
    const spots = ["台中市|北屯區", "台中市|西屯區", "台中市|大里區", "台中市|豐原區", "台中市|和平區", "新北市|淡水區", "台北市|北投區", "高雄市|鼓山區"];
    for (const key of spots) {
      const [city, district] = key.split("|");
      const at = anchorOf(city, district)!;
      const region = regionOf(city)!;
      if (!isOnLand(region, at.lat, at.lng, city)) outside.push(key);
    }
    expect(outside).toEqual([]);
  });

  it("台中可以比較遠近：豐原在北屯北、大里在南、西屯在西", () => {
    const placed = placeCats([
      { id: "f", city: "台中市", district: "豐原區" },
      { id: "b", city: "台中市", district: "北屯區" },
      { id: "d", city: "台中市", district: "大里區" },
      { id: "w", city: "台中市", district: "西屯區" },
    ], "central");
    const byId = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect(byId.f.y).toBeLessThan(byId.b.y);
    expect(byId.b.y).toBeLessThan(byId.d.y);
    expect(byId.w.x).toBeLessThan(byId.b.x);
  });

  it("沒有行政區就放在縣市；路名不會被當成區", () => {
    const city = placeCats([{ id: "a", city: "台中市", district: "" }], "central")[0];
    const street = placeCats([{ id: "b", city: "台中市", district: "文心路" }], "central")[0];
    expect(street.x).toBeCloseTo(city.x, 4);
    expect(street.y).toBeCloseTo(city.y, 4);
    expect(placeCats([{ id: "x", city: "火星市", district: "" }], "central")).toEqual([]);
    expect(placeCats([{ id: "t", city: "台北市", district: "大安區" }], "central")).toEqual([]);
  });

  it("同一個行政區兩隻以上先收成一顆，點開才散開", () => {
    const pair = [
      { id: "a", city: "台中市", district: "北屯區" },
      { id: "b", city: "台中市", district: "北屯區" },
    ];
    const collapsed = layoutCats(pair, "central", new Set());
    expect(collapsed).toEqual([expect.objectContaining({ type: "pile", count: 2, district: "北屯區" })]);
    const opened = layoutCats(pair, "central", new Set(["台中市|北屯區"]));
    const cats = opened.filter((item) => item.type === "cat");
    expect(cats).toHaveLength(2);
    if (cats[0].type === "cat" && cats[1].type === "cat") {
      expect(Math.hypot(cats[0].cat.x - cats[1].cat.x, cats[0].cat.y - cats[1].cat.y)).toBeGreaterThan(12);
    }
  });

  it("離島的貓仍留在畫布內", () => {
    const pair = placeCats([
      { id: "a", city: "台中市", district: "北屯區" },
      { id: "b", city: "台中市", district: "北屯區" },
    ], "central");
    expect(pair).toHaveLength(2);
    const islands = placeCats([
      { id: "p", city: "澎湖縣", district: "馬公市" },
      { id: "w", city: "金門縣", district: "烏坵鄉" },
      { id: "e", city: "連江縣", district: "東引鄉" },
    ], "islands");
    const size = MAP_SIZE.islands;
    for (const spot of islands) {
      expect(spot.x).toBeGreaterThan(0);
      expect(spot.x).toBeLessThan(size.width);
      expect(spot.y).toBeGreaterThan(0);
      expect(spot.y).toBeLessThan(size.height);
    }
    expect(islands.map((s) => s.id).sort()).toEqual(["e", "p", "w"]);
  });

  it("北、中、東、離島的新卡片會落到該區，並依毛色與個性選精靈", () => {
    const wanted = ["海苔", "桂圓", "山風", "潮潮"] as const;
    const rows = wanted.map((name) => {
      const cat = cats.find((item) => item.name === name)!;
      const loc = parseLocation(cat.district)!;
      const spot = placeCats([{ id: name, city: loc.city, district: loc.district }], regionOf(loc.city)!)[0];
      return { name, region: regionOf(loc.city), coat: coatKey(cat.coat), action: actionKey(cat.tags), onMap: Boolean(spot) };
    });
    expect(rows).toEqual([
      { name: "海苔", region: "north", coat: "gray", action: "meow", onMap: true },
      { name: "桂圓", region: "central", coat: "orange", action: "lively", onMap: true },
      { name: "山風", region: "east", coat: "tabby", action: "gentle", onMap: true },
      { name: "潮潮", region: "islands", coat: "calico", action: "sun", onMap: true },
    ]);
  });

  it("沒寫進手繪表的行政區仍在縣市附近", () => {
    const city = anchorOf("苗栗縣", "")!;
    const town = anchorOf("苗栗縣", "通霄鎮")!;
    expect(Math.hypot(town.lat - city.lat, town.lng - city.lng)).toBeGreaterThan(0.02);
    expect(isOnLand("central", town.lat, town.lng, "苗栗縣")).toBe(true);
    expect(anchorOf("花蓮縣", "花蓮市")).not.toEqual(anchorOf("花蓮縣", ""));
    expect(anchorOf("花蓮縣", "花蓮市路")).toEqual(anchorOf("花蓮縣", ""));
  });
});

describe("帶我回家地圖：毛色與動作", () => {
  it("對得上卡片常見毛色，橘白不會被認成白貓", () => {
    expect(coatKey("橘白色")).toBe("orangeWhite");
    expect(coatKey("三花")).toBe("calico");
    expect(coatKey("銀虎斑")).toBe("silverTabby");
    expect(coatKey("虎斑")).toBe("tabby");
    expect(coatKey("賓士")).toBe("tuxedo");
    expect(coatKey("黑白")).toBe("tuxedo");
    expect(coatKey("奶油")).toBe("cream");
    expect(coatKey("白")).toBe("white");
    expect(coatKey("灰")).toBe("gray");
    expect(coatKey("橘")).toBe("orange");
    expect(coatKey("黑")).toBe("black");
    expect(coatKey("玳瑁")).toBe("tortie");
    expect(coatKey("布偶")).toBe("point");
    expect(coatKey("calico")).toBe("calico");
    expect(coatKey("tuxedo")).toBe("tuxedo");
    expect(coatKey(null)).toBe("tabby");
    expect(coatKey("")).toBe("tabby");
    expect(COAT_KEYS).toContain(coatKey("橘白"));
  });

  it("動作跟卡片上的個性標籤，活潑、愛叫、愛曬太陽、輕柔都有", () => {
    expect(actionKey(["獨立", "愛曬太陽"])).toBe("sun");
    expect(actionKey(["愛叫", "親人"])).toBe("meow");
    expect(actionKey(["活潑"])).toBe("lively");
    expect(actionKey(["愛玩紙箱"])).toBe("lively");
    expect(actionKey(["輕柔"])).toBe("gentle");
    expect(actionKey(["溫和", "愛被梳毛"])).toBe("gentle");
    expect(actionKey(["愛踩踏", "親人"])).toBe("knead");
    expect(actionKey(["好奇"])).toBe("curious");
    expect(actionKey(["貪吃"])).toBe("eat");
    expect(actionKey(["黏人"])).toBe("clingy");
    expect(actionKey(["慢熟"])).toBe("shy");
    expect(actionKey(["安靜", "獨立"])).toBe("sleepy");
    expect(actionKey([])).toBe("idle");
    expect(previewTags(["安靜", "獨立", "愛曬太陽"])).toEqual(["愛曬太陽", "安靜"]);
    expect(ACTION_KEYS).toEqual(["sun", "meow", "lively", "gentle", "knead", "curious", "eat", "clingy", "shy", "sleepy", "idle"]);
  });

  it("各地區等家隻數", () => {
    expect(countByRegion(["台中市", "台中市", "台北市", "澎湖縣"])).toEqual({
      north: 1, central: 2, south: 0, east: 0, islands: 1,
    });
  });
});
