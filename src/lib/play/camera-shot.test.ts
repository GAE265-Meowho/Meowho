import { describe, expect, it } from "vitest";
import { shotFor, shotReach } from "./camera-shot";

describe("劇情鏡頭 shotFor", () => {
  it("第 1 天貓躲進外出籠：等貓走到籠子邊，再靠近、壓低看籠口", () => {
    const s = shotFor("day1", "carrier");
    expect(s).toMatchObject({ id: "carrier" });
    expect(s!.delayMs).toBeGreaterThan(0);
    expect(s!.dist).toBeLessThan(1.5);
  });

  it("半夜跑酷：拉遠，整段奔跑看得到", () => {
    const z = shotFor("day30", "zoom"), c = shotFor("day1", "carrier");
    expect(z).toMatchObject({ id: "zoom" });
    expect(z!.dist).toBeGreaterThan(c!.dist);
  });

  it("結尾：慢慢推近（比一般轉場久），貓不在畫面時不動鏡頭", () => {
    const f = shotFor("farewell", "frail"), b = shotFor("farewell", "bed");
    expect(f).toMatchObject({ id: "farewell" });
    expect(b).toMatchObject({ id: "farewell-bed" });
    expect(b!.dist).toBeLessThan(f!.dist);
    expect(b!.ms).toBeGreaterThanOrEqual(3000);
    expect(shotFor("farewell", "none")).toBeNull();
  });

  it("其他時刻沒有鏡頭提示（維持原本的鏡頭）", () => {
    expect(shotFor("day1", "sit")).toBeNull();
    expect(shotFor("month8", "zoom")).toBeNull();
    expect(shotFor("day3", "carrier")).toBeNull();
  });

  it("key 依節點與姿勢，同一個時刻不會重播", () => {
    expect(shotFor("day1", "carrier")!.key).toBe(shotFor("day1", "carrier")!.key);
    expect(shotFor("farewell", "frail")!.key).not.toBe(shotFor("farewell", "bed")!.key);
  });

  it("手機直式畫面退遠一點（最多 2.2 倍），橫式不變", () => {
    const s = { dist: 1, height: 0.5 };
    expect(shotReach(s, 16 / 9)).toEqual(s);
    expect(shotReach(s, 0.9)).toEqual(s);
    expect(shotReach(s, 0.45).dist).toBeCloseTo(2);
    expect(shotReach(s, 0.45).height).toBeCloseTo(1);
    expect(shotReach(s, 0.1).dist).toBeCloseTo(2.2);
  });
});
