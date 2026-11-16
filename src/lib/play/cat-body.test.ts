import { describe, expect, it } from "vitest";
import { KITTEN_MAX_MONTHS } from "@/lib/hq/cat-models/types";
import { CAT_HEIGHT_M, catHeightM, playBody, startBody } from "./cat-body";
import { adultFur, catLookFor, playCatLook } from "./cats";

describe("依年紀換幼貓／成貓（渝茜 2026-11-16）", () => {
  it("和後台同一條規則：6 個月以下是幼貓", () => {
    expect(KITTEN_MAX_MONTHS).toBe(6);
    expect(playBody(2)).toBe("kitten");
    expect(playBody(6)).toBe("kitten");
    expect(playBody(6.5)).toBe("adult");
    expect(playBody(8)).toBe("adult");   // 半年後（8 個月）已經是成貓體型
    expect(playBody(180)).toBe("adult");
  });
  it("開場顯示：知道月齡就看月齡，不知道才看中途填的生活階段", () => {
    expect(startBody(3, "adult")).toBe("kitten");
    expect(startBody(24, "kitten")).toBe("adult");
    expect(startBody(null, "kitten")).toBe("kitten");
    expect(startBody(null, null)).toBe("adult");
  });
  it("幼貓在房間裡比成貓小", () => {
    expect(catHeightM("adult")).toBe(CAT_HEIGHT_M.adult);
    expect(catHeightM("kitten")).toBeLessThan(catHeightM("adult"));
  });
});

describe("每隻貓用自己的模型（渝茜 2026-11-16：都寫死同一隻）", () => {
  const own = { adult: "https://x/adult.png", kitten: "https://x/kitten.png" };
  it("有這個體型的貼圖：用自己的", () => {
    expect(catLookFor("kitten", own)).toEqual({ body: "kitten", baseUrl: "/api/hq/cat-models/base?body=kitten", albedoUrl: own.kitten });
    expect(catLookFor("adult", own)).toEqual({ body: "adult", baseUrl: "/api/hq/cat-models/base", albedoUrl: own.adult });
  });
  it("只有成貓貼圖、劇情要幼貓：借成貓的母體＋貼圖（花色對），體型仍是幼貓（房間裡縮小）", () => {
    expect(catLookFor("kitten", { adult: own.adult })).toEqual({ body: "kitten", baseUrl: "/api/hq/cat-models/base", albedoUrl: own.adult });
  });
  it("只有幼貓貼圖、劇情要成貓：借幼貓的", () => {
    expect(catLookFor("adult", { kitten: own.kitten })).toEqual({ body: "adult", baseUrl: "/api/hq/cat-models/base?body=kitten", albedoUrl: own.kitten });
  });
  it("完全沒有自己的貼圖：才退回示範虎斑", () => {
    expect(catLookFor("kitten", null)).toEqual(playCatLook("kitten"));
    expect(catLookFor("adult", {})).toEqual(playCatLook("adult"));
  });
});

describe("摸貓小遊戲的花色", () => {
  it("用這隻貓的成貓貼圖；只有幼貓貼圖時用母體預設花色", () => {
    expect(adultFur(catLookFor("adult", { adult: "a.png" }))).toBe("a.png");
    expect(adultFur(catLookFor("adult", { kitten: "k.png" }))).toBeNull();
    expect(adultFur(playCatLook("kitten"))).toBeNull();
  });
});
