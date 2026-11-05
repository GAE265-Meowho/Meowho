import { describe, expect, it } from "vitest";
import { coverAfterRemoveAngle, coverAfterRemoveOther, coverPath, emptyAngles, newCatMissing } from "./new-cat";

const ok = { name: "橘子", lifeStage: "kitten" as const, angles: { ...emptyAngles(), left: "u/left.jpg" }, consent: true };

describe("UT-02-07：新增貓咪的必填（名字、年齡層、側面照片、同意授權）", () => {
  it("四項都有就可以建立；其他欄位都可以之後再補", () => {
    expect(newCatMissing(ok)).toEqual([]);
  });
  it("少任何一項都不行，並列出還沒填的", () => {
    expect(newCatMissing({ ...ok, name: " " })).toEqual(["名字"]);
    expect(newCatMissing({ ...ok, lifeStage: null })).toEqual(["年齡層"]);
    expect(newCatMissing({ ...ok, angles: { ...emptyAngles(), front: "u/f.jpg", back: "u/b.jpg" } })).toEqual(["側面照片"]);
    expect(newCatMissing({ ...ok, consent: false })).toEqual(["同意授權"]);
    expect(newCatMissing({ name: "", lifeStage: null, angles: emptyAngles(), consent: false })).toEqual(["名字", "年齡層", "側面照片", "同意授權"]);
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
