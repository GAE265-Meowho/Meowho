import { describe, expect, it } from "vitest";
import {
  BOWL_RADIUS_M, PAW_AHEAD_M, REST_SECONDS, bowlObstacles, dropTargetBowl, standOff, STORY_START, bubbleOf, defaultBowlSlots, headDownPose, isBowlSet, isFoodBowl, isLitterBox, isWaterBowl, passableItem, stepItems,
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
    expect(passableItem(daily, "餐碗組")).toBe(true);
    expect(passableItem(daily, "外出籠")).toBe(false);
    expect(passableItem(null, "貓砂盆")).toBe(false);
  });
});

describe("站的位置", () => {
  const single = { key: "w1", name: "水碗", x: 2, z: 2, widthM: 0.2, depthM: 0.2 };
  it("單一碗：站在碗中心往外 reach、離貓最近的一邊，面向碗", () => {
    const spot = stepSpot(drink, single, { x: 2, z: 4 }, () => false, { reach: 0.2 })!;
    expect(spot.x).toBeCloseTo(2);
    expect(spot.z).toBeCloseTo(2.2);
    expect(spot.heading).toBeCloseTo(Math.PI);
    expect(spot.item).toBe("w1");
  });
  it("站位＝碗半徑＋前腳掌在身體前方的距離：腳掌踩在碗外（#318）；幼貓站得更近", () => {
    expect(standOff("adult")).toBeCloseTo(BOWL_RADIUS_M + PAW_AHEAD_M.adult + 0.015);
    expect(standOff("kitten")).toBeLessThan(standOff("adult"));
    const spot = stepSpot(drink, single, { x: 2, z: 4 }, () => false, { reach: standOff("kitten") })!;
    expect(spot.z).toBeCloseTo(2 + standOff("kitten"));
    expect(spot.target).toEqual({ x: 2, z: 2 });
  });
  it("最近的一邊被擋住換別邊；全擋住回傳 null", () => {
    expect(stepSpot(eat, bowl, { x: 2, z: 4 }, (_x, z) => z > 1.9)!.z).toBeLessThan(2);
    expect(stepSpot(eat, bowl, { x: 2, z: 4 }, () => true)).toBeNull();
  });
  it("餐碗組：吃飯站飼料碗前、喝水站水碗前；只從短邊靠近", () => {
    const set = { key: "s", name: "餐碗組", x: 2, z: 2, widthM: 0.52, depthM: 0.34 };
    const slots = { food: [-0.13, 0] as [number, number], water: [0.13, 0] as [number, number] };
    const e = stepSpot(eat, set, { x: 2, z: 4 }, () => false, { reach: 0.2, slots })!;
    expect(e.x).toBeCloseTo(1.87);
    expect(e.z).toBeCloseTo(2.2);
    const d = stepSpot(drink, set, { x: 4, z: 2 }, () => false, { reach: 0.2, slots })!;
    expect(d.x).toBeCloseTo(2.13);       // 貓從右邊來也不會從長邊伸過去
    expect(Math.abs(d.z - 2)).toBeCloseTo(0.2);
  });
  it("餐碗組轉 180 度：碗的位置跟著轉", () => {
    const set = { key: "s", name: "餐碗組", x: 2, z: 2, widthM: 0.52, depthM: 0.34, rotY: 180 };
    const slots = { food: [-0.13, 0] as [number, number], water: [0.13, 0] as [number, number] };
    expect(stepSpot(eat, set, { x: 2, z: 4 }, () => false, { reach: 0.2, slots })!.x).toBeCloseTo(2.13);
  });
  it("沒辨識到碗位置：沿長邊左右各四分之一", () => {
    expect(defaultBowlSlots({ widthM: 0.52, depthM: 0.34 })).toEqual({ food: [-0.13, 0], water: [0.13, 0] });
    expect(defaultBowlSlots({ widthM: 0.3, depthM: 0.6 })).toEqual({ food: [0, -0.15], water: [0, 0.15] });
  });
  it("餐碗組也算喝水的用品", () => {
    expect(isBowlSet("餐碗組")).toBe(true);
    expect(drink.match("餐碗組")).toBe(true);
    expect(drink.match("陶瓷飯碗")).toBe(false);
  });
  it("貓砂盆：站正中央、面朝貓砂盆正面", () => {
    const box = { key: "l", name: "貓砂盆", x: 1, z: 1, widthM: 0.34, depthM: 0.5 };
    expect(stepSpot(toilet, box, { x: 3, z: 3 }, () => true)).toEqual({ x: 1, z: 1, heading: 0, item: "l", target: { x: 1, z: 1 } });
    expect(stepSpot(toilet, { ...box, rotY: 180 }, { x: 3, z: 3 }, () => true)!.heading).toBeCloseTo(Math.PI);
  });
  it("站位檢查會拿到要吃的碗中心", () => {
    const set = { key: "s", name: "餐碗組", x: 2, z: 2, widthM: 0.52, depthM: 0.34 };
    const seen: { x: number; z: number }[] = [];
    stepSpot(drink, set, { x: 2, z: 4 }, (_x, _z, t) => { seen.push(t); return false; }, { slots: { food: [-0.13, 0], water: [0.13, 0] } });
    expect(seen[0].x).toBeCloseTo(2.13);
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

describe("碗的碰撞（#318）", () => {
  const set = { key: "s", name: "餐碗組", x: 2, z: 2, widthM: 0.52, depthM: 0.34 };
  const slots = { food: [-0.13, 0] as [number, number], water: [0.13, 0] as [number, number] };
  it("餐碗組＝兩個碗各一個方塊（碗墊可以踩）；單一碗＝整個用品；貓砂盆、家具上的不算", () => {
    const obs = bowlObstacles(daily, [set, { key: "w", name: "水碗", x: 1, z: 1, widthM: 0.2, depthM: 0.2 },
      { key: "l", name: "貓砂盆", x: 3, z: 3, widthM: 0.34, depthM: 0.5 },
      { key: "t", name: "水碗", x: 1, z: 3, widthM: 0.2, depthM: 0.2, support: { furnitureIndex: 0 } }], () => slots);
    expect(obs.map(o => [o.x, o.z, o.hx])).toEqual([[1.87, 2, BOWL_RADIUS_M], [2.13, 2, BOWL_RADIUS_M], [1, 1, 0.1]]);
  });
  it("最後靠近、而且在站位那一側時，才拿掉要吃的碗（同一組的另一個碗也拿掉，幼貓才不會卡在碗角）", () => {
    const obs = bowlObstacles(daily, [set], () => slots);
    const spot = stepSpot(eat, set, { x: 2, z: 4 }, () => false, { reach: standOff("adult"), slots })!;
    expect(dropTargetBowl([...obs, { x: 3, z: 2, hx: 0.1, hz: 0.1, rotY: 0 }], spot, { x: 1.9, z: 2.4 })).toHaveLength(1);   // 前面、很近 → 拿掉這組兩個碗，別的碗保留
    expect(dropTargetBowl(obs, spot, { x: 1.9, z: 1.6 })).toHaveLength(2);          // 碗的另一側 → 不拿（不會穿過去）
    expect(dropTargetBowl(obs, spot, { x: 1.9, z: 3.5 })).toHaveLength(2);          // 還很遠 → 不拿
    expect(dropTargetBowl(obs, null, { x: 1.9, z: 2.4 })).toHaveLength(2);
  });
});

