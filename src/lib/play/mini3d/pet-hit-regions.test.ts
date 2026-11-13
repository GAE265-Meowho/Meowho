import { Group, Raycaster, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createPetHitRegions } from "./pet-hit-regions";

const joints = ["head0", "jaw", "body_bot", "tail1", "tail2", "tail3", "tail4", "tail5", "tail6"];

function setup() {
  const model = new Group();
  for (const name of joints) {
    const joint = new Group();
    joint.name = name;
    model.add(joint);
  }
  const regions = createPetHitRegions(model);
  const hit = (y: number, z: number) => regions.hit(new Raycaster(new Vector3(1, y, z), new Vector3(-1, 0, 0)));
  return { model, regions, hit };
}

describe("摸貓骨架命中區", () => {
  it.each([
    [0.408, 0.173, "head"],
    [0.339, 0.205, "chin"],
    [0.302, -0.056, "back"],
    [0.212, -0.058, "belly"],
    [0.245, -0.239, "tail"],
    [0.146, -0.278, "tail"],
    [0.134, -0.419, "tail"],
    [0.112, -0.28, null],
    [0.65, -0.24, null],
  ])("側視射線 y=%s、z=%s 命中 %s", (y, z, expected) => {
    const { hit, regions } = setup();
    expect(hit(y, z)).toBe(expected);
    regions.dispose();
  });

  it("尾根和背部投影相近時，尾根可命中、背部保留有效範圍", () => {
    const { hit, regions } = setup();
    expect(hit(0.267, -0.233)).toBe("tail");
    expect(hit(0.302, -0.189)).toBe("back");
    regions.dispose();
  });

  it("投影重疊時優先近深度尾根，但保留前方軀幹遮擋", () => {
    const { model, hit, regions } = setup();
    const root = model.getObjectByName("tail1")!;
    root.position.set(0.035, 0.062, 0.071);
    expect(hit(0.302, -0.17)).toBe("tail");
    root.position.x = 0.005;
    expect(hit(0.302, -0.17)).toBe("back");
    regions.dispose();
  });

  it("尾端代理跟隨骨架姿勢，並於離場時移除", () => {
    const { model, hit, regions } = setup();
    const tip = model.getObjectByName("tail6")!;
    tip.position.y = 0.08;
    expect(hit(0.134, -0.419)).toBeNull();
    expect(hit(0.214, -0.419)).toBe("tail");
    regions.dispose();
    expect(tip.children).toHaveLength(0);
    expect(hit(0.214, -0.419)).toBeNull();
  });
});
