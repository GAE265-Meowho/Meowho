import { describe, expect, it } from "vitest";
import { countyFromGeo, nearestCounty, placeFromGeo } from "./visitor-city";
import { DISTRICTS } from "./region-bounds";

describe("上網所在縣市", () => {
  it("經緯度對到最近的縣市", () => {
    expect(nearestCounty(24.15, 120.67)).toBe("台中市");
    expect(nearestCounty(25.04, 121.56)).toBe("台北市");
    expect(nearestCounty(22.63, 120.3)).toBe("高雄市");
    expect(nearestCounty(48.8, 2.3)).toBeNull();
  });

  it("英文縣市名也能對上", () => {
    expect(countyFromGeo({ city: "Taichung" })).toBe("台中市");
    expect(countyFromGeo({ city: "New Taipei" })).toBe("新北市");
    expect(countyFromGeo({ city: "Hsinchu County" })).toBe("新竹縣");
  });

  it("有經緯度時以距離為準，並對到行政區", () => {
    expect(countyFromGeo({ city: "Taipei", lat: 24.15, lng: 120.67 })).toBe("台中市");
    const town = DISTRICTS.find((item) => item.c === "台中市" && item.n === "北屯區");
    const place = placeFromGeo({ lat: town?.l[1], lng: town?.l[0] });
    expect(place.city).toBe("台中市");
    expect(place.district).toBe("北屯區");
  });
});
