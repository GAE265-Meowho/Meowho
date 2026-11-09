import { describe, expect, it } from "vitest";
import { DISTRICTS } from "./geo/region-bounds";
import { TW_CITIES } from "./geo/tw-districts";
import {
  ADOPT_REGIONS, ACTION_KEYS, COAT_KEYS, LANDMARKS, MAP_SIZE,
  actionKey, anchorOf, coatKey, countByRegion, isOnLand, landmarkDots, parseLocation, placeCats, previewTags, regionOf,
} from "./adopt-map";

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

  it("同一個行政區的貓會錯開，離島仍留在畫布內", () => {
    const pair = placeCats([
      { id: "a", city: "台中市", district: "北屯區" },
      { id: "b", city: "台中市", district: "北屯區" },
    ], "central");
    expect(Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y)).toBeGreaterThan(12);
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

  it("地標落在該區畫布內", () => {
    for (const region of ADOPT_REGIONS) {
      const size = MAP_SIZE[region.id];
      for (const mark of landmarkDots(region.id)) {
        expect(mark.x, mark.name).toBeGreaterThan(4);
        expect(mark.x, mark.name).toBeLessThan(size.width - 4);
        expect(mark.y, mark.name).toBeGreaterThan(4);
        expect(mark.y, mark.name).toBeLessThan(size.height - 4);
      }
    }
    expect(new Set(LANDMARKS.map((m) => m.region)).size).toBe(ADOPT_REGIONS.length);
  });

  it("沒寫進手繪表的行政區仍在縣市附近", () => {
    const city = anchorOf("苗栗縣", "")!;
    const town = anchorOf("苗栗縣", "通霄鎮")!;
    expect(Math.hypot(town.lat - city.lat, town.lng - city.lng)).toBeGreaterThan(0.01);
    expect(Math.hypot(town.lat - city.lat, town.lng - city.lng)).toBeLessThan(0.12);
    expect(isOnLand("central", town.lat, town.lng, "苗栗縣")).toBe(true);
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
