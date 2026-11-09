import { describe, expect, it } from "vitest";
import {
  REST_SECONDS, STORY_START, bubbleOf, headDownPose, isFoodBowl, isLitterBox, isWaterBowl, passableItem, stepItems,
  stepSpot, stepStory, storyById, storyProgress, withoutItem, type StoryState,
} from "./story";

const daily = storyById("daily")!;
const [eat, drink, toilet] = daily.steps;
const bowl = { key: "b1", name: "餐碗組", x: 2, z: 2, widthM: 0.4, depthM: 0.2 };

describe("故事線清單（#297）", () => {
  it("貓咪的吃喝拉撒：吃 → 喝 → 上廁所", () => {
    expect(daily.name).toBe("貓咪的吃喝拉撒");
    expect(daily.steps.map(s => s.clip)).toEqual(["eat", "drink", "toilet"]);
    expect(storyById("nope")).toBeNull();
    expect(storyById(null)).toBeNull();
  });
  it("用品名稱判斷", () => {
    expect(isFoodBowl("餐碗組")).toBe(true);
    expect(isFoodBowl("水碗")).toBe(false);
    expect(isWaterBowl("水碗")).toBe(true);
    expect(isWaterBowl("循環飲水機")).toBe(true);
    expect(isWaterBowl("餐碗組")).toBe(false);
    expect(isLitterBox("貓砂盆")).toBe(true);
    expect(isLitterBox("飲水機")).toBe(false);
  });
  it("放在家具上的用品不算；貓砂盆不當障礙", () => {
    const onTable = { ...bowl, key: "b2", support: { furnitureIndex: 0, localX: 0, localZ: 0 } };
    expect(stepItems(eat, [bowl, onTable, { ...bowl, key: "w", name: "水碗" }]).map(b => b.key)).toEqual(["b1"]);
    expect(passableItem(daily, "貓砂盆")).toBe(true);
    expect(passableItem(daily, "餐碗組")).toBe(false);
    expect(passableItem(null, "貓砂盆")).toBe(false);
  });
});

describe("站的位置", () => {
  it("碗：挑離貓最近、站得下的一邊，面向碗", () => {
    const spot = stepSpot(eat, bowl, { x: 2, z: 4 }, () => false)!;
    expect(spot.x).toBeCloseTo(2);
    expect(spot.z).toBeCloseTo(2.36);
    expect(spot.heading).toBeCloseTo(Math.PI);
    expect(spot.item).toBe("b1");
  });
  it("最近的一邊被擋住換別邊；全擋住回傳 null", () => {
    expect(stepSpot(eat, bowl, { x: 2, z: 4 }, (_x, z) => z > 1.9)!.z).toBeLessThan(2);
    expect(stepSpot(eat, bowl, { x: 2, z: 4 }, () => true)).toBeNull();
  });
  it("碗轉 90 度時，左右兩邊改用碗的深度", () => {
    const spot = stepSpot(drink, { ...bowl, rotY: 90 }, { x: 4, z: 2 }, () => false)!;
    expect(Math.hypot(spot.x - 2, spot.z - 2)).toBeCloseTo(0.36);
  });
  it("貓砂盆：站正中央、面朝貓砂盆正面", () => {
    const box = { key: "l", name: "貓砂盆", x: 1, z: 1, widthM: 0.34, depthM: 0.5 };
    expect(stepSpot(toilet, box, { x: 3, z: 3 }, () => true)).toEqual({ x: 1, z: 1, heading: 0, item: "l" });
    expect(stepSpot(toilet, { ...box, rotY: 180 }, { x: 3, z: 3 }, () => true)!.heading).toBeCloseTo(Math.PI);
  });
  it("障礙清單拿掉用品自己", () => {
    const obs = [{ x: 2, z: 2, hx: 0.2, hz: 0.1, rotY: 0 }, { x: 1, z: 1, hx: 0.5, hz: 0.5, rotY: 0 }];
    expect(withoutItem(obs, bowl)).toEqual([obs[1]]);
  });
});

describe("故事線狀態", () => {
  const go = (st: StoryState, over: Partial<{ has: boolean; spot: boolean; arrived: boolean; dt: number }> = {}) =>
    stepStory(daily, st, { has: true, spot: true, arrived: false, dt: 0.1, ...over });

  it("一開始：肚子餓，顯示餐碗對話框", () => {
    const st = go(STORY_START, { has: false });
    expect(st.phase).toBe("need");
    expect(bubbleOf(daily, st)?.icon).toBe("bowl");
  });
  it("吃完休息一下 → 口渴 → 喝完 → 想上廁所 → 上完故事線結束", () => {
    let st = go(STORY_START);
    expect(st.phase).toBe("going");
    expect(bubbleOf(daily, st)).toBeNull();
    st = go(st, { arrived: true });
    expect(st.phase).toBe("doing");
    st = go(st, { dt: eat.seconds });
    expect(st).toEqual({ step: 0, phase: "rest", t: 0 });
    expect(storyProgress(daily, st)).toEqual(["done", "todo", "todo"]);
    st = go(st, { dt: REST_SECONDS });
    expect(st).toEqual({ step: 1, phase: "need", t: 0 });
    expect(bubbleOf(daily, go(st, { has: false }))?.icon).toBe("water");
    expect(storyProgress(daily, st)).toEqual(["done", "active", "todo"]);
    st = go(go(go(st), { arrived: true }), { dt: drink.seconds });
    st = go(st, { dt: REST_SECONDS });
    expect(bubbleOf(daily, go(st, { has: false }))?.icon).toBe("litter");
    st = go(go(go(st), { arrived: true }), { dt: toilet.seconds });
    expect(st.phase).toBe("done");
    expect(storyProgress(daily, st)).toEqual(["done", "done", "done"]);
    expect(go(st, { has: false }).phase).toBe("done");
  });
  it("走路或做到一半用品被拿走 → 回到等用品", () => {
    expect(go({ step: 1, phase: "going", t: 0 }, { has: false })).toEqual({ step: 1, phase: "need", t: 0 });
    expect(go({ step: 0, phase: "doing", t: 3 }, { has: false })).toEqual({ step: 0, phase: "need", t: 0 });
  });
  it("休息時拿走用品不影響", () => {
    expect(go({ step: 0, phase: "rest", t: 0 }, { has: false }).phase).toBe("rest");
  });
  it("站不下時維持等用品", () => {
    expect(go(STORY_START, { spot: false }).phase).toBe("need");
  });
});

describe("程式版動作", () => {
  it("吃、喝低頭；權重 0 或上廁所不動", () => {
    expect(headDownPose("eat", 0, 0)).toEqual({ neck0: 0, neck1: 0, head0: 0 });
    expect(headDownPose("toilet", 1)).toEqual({ neck0: 0, neck1: 0, head0: 0 });
    expect(headDownPose("eat", 0.2).neck0).toBeGreaterThan(0.5);
    expect(headDownPose("drink", 0.1).neck0).toBeGreaterThan(headDownPose("eat", 0.1).neck0);
  });
});
