import { describe, expect, it } from "vitest";
import { clampFurniturePose, rotatedHalfExtents } from "./experience-physics";

describe("experience-physics", () => {
  it("rotatedHalfExtents：0°／90° 對調寬深", () => {
    expect(rotatedHalfExtents(2, 1, 0)).toEqual({ hx: 1, hz: 0.5 });
    expect(rotatedHalfExtents(2, 1, 90)).toEqual({ hx: 0.5, hz: 1 });
  });

  it("clampFurniturePose：壓回房間內", () => {
    const half = { hx: 0.5, hz: 0.5 };
    expect(clampFurniturePose({ x: -1, z: 10 }, half, [4, 3], [])).toEqual({ x: 0.55, z: 2.45 });
  });

  it("clampFurniturePose：與其他落地家具重疊時推開", () => {
    const half = { hx: 0.5, hz: 0.5 };
    const out = clampFurniturePose(
      { x: 1.2, z: 1 }, half, [6, 6],
      [{ x: 1, z: 1, hx: 0.5, hz: 0.5 }],
    );
    expect(Math.abs(out.x - 1) >= 0.999 || Math.abs(out.z - 1) >= 0.999).toBe(true);
  });

  it("onSupport 時不與落地障礙互斥，仍夾房間", () => {
    const half = { hx: 0.3, hz: 0.3 };
    const out = clampFurniturePose(
      { x: 1.05, z: 1 }, half, [6, 6],
      [{ x: 1, z: 1, hx: 0.5, hz: 0.5 }],
      { onSupport: true },
    );
    expect(out).toEqual({ x: 1.05, z: 1 });
  });
});
