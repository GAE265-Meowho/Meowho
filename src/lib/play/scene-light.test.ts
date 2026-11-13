import { afterEach, describe, expect, it, vi } from "vitest";
import { lightFor, lightTime, playLightTime, poseSpeed, veilShift, ZOOM_SPEED } from "./scene-light";
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
    expect(d.scan.veil.alpha).toBe(0);
  });

  it("夜晚整體變暗，但貓有補光、掃描房間的夜色不會全黑", () => {
    const d = lightFor("day"), n = lightFor("night");
    expect(n.house.hemi.intensity).toBeLessThan(d.house.hemi.intensity);
    expect(n.house.sun.intensity).toBeLessThan(d.house.sun.intensity);
    expect(n.house.catLight).toBeGreaterThan(0);
    expect(n.scan.hemi.intensity).toBeLessThan(d.scan.hemi.intensity);
    expect(n.scan.veil.alpha).toBeGreaterThan(0.3);
    expect(n.scan.veil.alpha).toBeLessThan(0.75);
  });

  it("半夜跑酷（zoom）加速，其他姿勢不變", () => {
    expect(poseSpeed("zoom", 1)).toBe(ZOOM_SPEED);
    expect(poseSpeed("sit", 0.85)).toBe(0.85);
  });

  it("夜色的洞跟著貓：畫面中央 → veil 置中；跑出畫面時夾住，veil 仍蓋滿畫面", () => {
    expect(veilShift(0.5, 0.5).map(v => Math.round(v * 100) / 100)).toEqual([-33.33, -33.33]);
    expect(veilShift(0, 1)).toEqual([-50, veilShift(1, 1)[1]]);
    expect(veilShift(-9, 9)).toEqual(veilShift(-0.5, 1.5));
    // veil 的左緣（宿主寬度的倍數）＝ shift% × 3，夾住後最多到 −2、最少到 −1，右緣都 ≥ 1
    for (const f of [-9, -0.5, 0, 0.5, 1, 1.5, 9]) {
      const left = (veilShift(f, f)[0] / 100) * 3;
      expect(left).toBeLessThanOrEqual(0);
      expect(left + 3).toBeGreaterThanOrEqual(1);
    }
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
