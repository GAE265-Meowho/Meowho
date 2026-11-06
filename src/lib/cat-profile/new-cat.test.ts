import { describe, expect, it } from "vitest";
import { catPagePhotos, coverAfterRemoveAngle, coverAfterRemoveOther, coverPath, emptyAngles, newCatMissing } from "./new-cat";

const ok = { name: "橘子", lifeStage: "kitten" as const, angles: { front: "u/front.jpg", left: "u/left.jpg", back: "u/back.jpg" }, consent: true };

describe("UT-02-07：新增貓咪的必填（名字、年齡、正面／側面／背面三張照片、同意授權）", () => {
  it("四項都有就可以建立；其他欄位都可以之後再補", () => {
    expect(newCatMissing(ok)).toEqual([]);
  });
  it("少任何一項都不行，並列出還沒填的", () => {
    expect(newCatMissing({ ...ok, name: " " })).toEqual(["名字"]);
    expect(newCatMissing({ ...ok, lifeStage: null })).toEqual(["大概幾歲"]);
    expect(newCatMissing({ ...ok, angles: { ...emptyAngles(), front: "u/f.jpg", back: "u/b.jpg" } })).toEqual(["側面照片"]);
    // 建 3D 模型至少要三張：只有兩張不行（子哲 2026-11-05）
    expect(newCatMissing({ ...ok, angles: { ...emptyAngles(), front: "u/f.jpg", left: "u/l.jpg" } })).toEqual(["背面照片"]);
    expect(newCatMissing({ ...ok, consent: false })).toEqual(["同意授權"]);
    expect(newCatMissing({ name: "", lifeStage: null, angles: emptyAngles(), consent: false })).toEqual(["名字", "大概幾歲", "正面照片", "側面照片", "背面照片", "同意授權"]);
  });
  it("修改既有的貓不要求角度照（0024 以前的貓沒有另外存）", () => {
    expect(newCatMissing({ ...ok, angles: emptyAngles() }, { angles: false })).toEqual([]);
  });
});

describe("UT-03-08：選封面、刪掉封面照後改回預設那張", () => {
  const angles = { front: "a/front.jpg", left: "a/left.jpg", back: null };
  const others = ["o/1.jpg", "o/2.jpg", "o/3.jpg"];
  it("可以從任一張已上傳的照片選封面", () => {
    expect(coverPath("a:left", angles, others)).toBe("a/left.jpg");
    expect(coverPath("o:2", angles, others)).toBe("o/3.jpg");
  });
  it("沒選就用預設：生活照第一張，沒有生活照就用正面、側面、背面", () => {
    expect(coverPath(null, angles, others)).toBe("o/1.jpg");
    expect(coverPath(null, angles, [])).toBe("a/front.jpg");
    expect(coverPath(null, { front: null, left: "a/left.jpg", back: null }, [])).toBe("a/left.jpg");
    expect(coverPath(null, emptyAngles(), [])).toBeNull();
  });
  it("刪掉封面那張生活照 → 改回預設；刪前面的 → 封面跟著往前", () => {
    expect(coverAfterRemoveOther("o:1", 1)).toBeNull();
    expect(coverAfterRemoveOther("o:2", 0)).toBe("o:1");
    expect(coverAfterRemoveOther("o:0", 2)).toBe("o:0");
    expect(coverAfterRemoveOther("a:left", 0)).toBe("a:left");
  });
  it("刪掉封面那張角度照 → 改回預設；選的照片不在了也顯示預設", () => {
    expect(coverAfterRemoveAngle("a:back", "back")).toBeNull();
    expect(coverAfterRemoveAngle("a:back", "front")).toBe("a:back");
    expect(coverPath("a:back", angles, others)).toBe("o/1.jpg");
    expect(coverPath("o:9", angles, others)).toBe("o/1.jpg");
  });
});

describe("貓咪頁的照片（封面排第一張）", () => {
  const photo_angles = { front: "f.jpg", left: "l.jpg", back: "b.jpg" };
  it("只有角度照、封面選側面：側面排第一，其餘照順序", () => {
    expect(catPagePhotos({ cover: "a:left", photo_angles, photo_paths: [] })).toEqual(["l.jpg", "f.jpg", "b.jpg"]);
  });
  it("封面是第 2 張生活照：放第一，不重複", () => {
    expect(catPagePhotos({ cover: "o:1", photo_angles, photo_paths: ["o0.jpg", "o1.jpg"] })).toEqual(["o1.jpg", "f.jpg", "l.jpg", "b.jpg", "o0.jpg"]);
  });
  it("沒選封面：用預設（生活照第一張）；舊資料沒有角度照也照樣顯示", () => {
    expect(catPagePhotos({ cover: null, photo_angles: null, photo_paths: ["o0.jpg"] })).toEqual(["o0.jpg"]);
    expect(catPagePhotos({ cover: null, photo_angles, photo_paths: null })).toEqual(["f.jpg", "l.jpg", "b.jpg"]);
  });
});
