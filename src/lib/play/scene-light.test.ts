import { afterEach, describe, expect, it, vi } from "vitest";
import { lightFor, lightTime, playLightTime, poseSpeed, ZOOM_SPEED } from "./scene-light";
import { onSceneChange, reportScene, resetScene, sceneChanged, sceneOf } from "./scene-change";

describe("白天／夜晚兩種光", () => {
  it("只有 night 是夜晚，傍晚歸白天（待渝茜確認），不認得的也是白天", () => {
    expect(lightTime("night")).toBe("night");
    expect(lightTime("dusk")).toBe("day");
    expect(lightTime("day")).toBe("day");
    expect(lightTime(undefined)).toBe("day");
    expect(lightFor("dusk")).toBe(lightFor("day"));
  });

  it("只有劇情節點裡的夜晚是夜晚；開場、在家的時光是白天", () => {
    expect(playLightTime({ step: "node", time: "night", home: false })).toBe("night");
    expect(playLightTime({ step: "node", time: "night", home: true })).toBe("day");
    expect(playLightTime({ step: "place", time: "night", home: false })).toBe("day");
  });

  it("白天＝兩個 3D 元件原本的燈光（白天傳進去畫面不變）", () => {
    const d = lightFor("day");
    expect(d.house).toMatchObject({ background: "#F3EFE7", hemi: { sky: "#fffaf2", ground: "#d8ccb8", intensity: 1.7 }, ambient: 0.35, sun: { color: "#fff6e8", intensity: 2.2 }, catLight: 0 });
    expect(d.scan.hemi).toEqual({ sky: 0xffffff, ground: 0x808080, intensity: 1.6 });
    expect(d.scan.tint).toEqual([1, 1, 1]);
    expect(d.scan.catLight).toBe(0);
  });

  it("夜晚整體變暗偏藍，但貓有補光、掃描房間不會全黑", () => {
    const d = lightFor("day"), n = lightFor("night");
    expect(n.house.hemi.intensity).toBeLessThan(d.house.hemi.intensity);
    expect(n.house.sun.intensity).toBeLessThan(d.house.sun.intensity);
    expect(n.house.catLight).toBeGreaterThan(0);
    expect(n.scan.hemi.intensity).toBeLessThan(d.scan.hemi.intensity);
    const [r, g, b] = n.scan.tint;
    expect(Math.max(r, g, b)).toBeLessThan(0.7);
    expect(Math.min(r, g, b)).toBeGreaterThan(0.15);
    expect(b).toBeGreaterThan(r);
    expect(n.scan.catLight).toBeGreaterThan(0);
  });

  it("半夜跑酷（zoom）加速，其他姿勢不變", () => {
    expect(poseSpeed("zoom", 1)).toBe(ZOOM_SPEED);
    expect(poseSpeed("sit", 0.85)).toBe(0.85);
  });
});

describe("場景換了的事件", () => {
  afterEach(() => resetScene());
  const node = (time: string, nodeId = "day30", home = false) => sceneOf({ step: "node", nodeId, scene: { bg: "room", time }, home });

  it("事件內容有 bg、正規化的 time、節點 id；節點外 nodeId 是 null", () => {
    expect(node("dusk", "year10")).toEqual({ bg: "room", time: "day", nodeId: "year10", step: "node" });
    expect(sceneOf({ step: "shop", nodeId: "day1", scene: { bg: "vet", time: "night" }, home: false })).toEqual({ bg: "room", time: "day", nodeId: null, step: "shop" });
  });

  it("bg 或 time 變了才發，一樣的不重發；傍晚換白天不算換", () => {
    const fn = vi.fn();
    const off = onSceneChange(fn);
    expect(reportScene(node("day", "day3"))).toBe(true);
    expect(reportScene(node("dusk", "day3"))).toBe(false);
    expect(reportScene(node("night"))).toBe(true);
    expect(reportScene(node("night"))).toBe(false);
    expect(reportScene(sceneOf({ step: "node", nodeId: "day30", scene: { bg: "vet", time: "night" }, home: false }))).toBe(true);
    expect(fn.mock.calls.map(c => `${c[0].nodeId}:${c[0].bg}:${c[0].time}`)).toEqual(["day3:room:day", "day30:room:night", "day30:vet:night"]);
    off();
    reportScene(node("day"));
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("sceneChanged：第一次一定算換", () => {
    expect(sceneChanged(null, node("day"))).toBe(true);
  });
});
