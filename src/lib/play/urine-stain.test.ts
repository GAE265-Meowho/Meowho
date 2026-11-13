import { describe, expect, it } from "vitest";
import { blocked, obstacles } from "@/lib/hq/floorplans/catwalk";
import { houseScene } from "@/lib/hq/floorplans/scene";
import type { Life } from "./story";
import { DEMO_DOLLHOUSE } from "./room";
import { blobOutline, houseStainSpots, scanStainSpots, stainsFor } from "./urine-stain";
import { farewellPhase } from "./farewell";

const life = (sex: "male" | "female" | "unknown", neutered: boolean | null = false, age = 8) =>
  ({ cat: { coat: null, sex, neutered }, age } as unknown as Life);
const base = { step: "node", nodeId: "month8", bg: "room", pose: "zoom" } as const;

describe("stainsFor", () => {
  it("半年後、公貓未結紮、噴尿那一幕：出現 3 灘", () => {
    expect(stainsFor({ ...base, life: life("male") })).toHaveLength(3);
    expect(stainsFor({ ...base, life: life("unknown") })).toHaveLength(3);
  });
  it("母貓（半夜叫）、已結紮、成貓、別的節點都不出現", () => {
    expect(stainsFor({ ...base, life: life("female") })).toEqual([]);
    expect(stainsFor({ ...base, life: life("male", true) })).toEqual([]);
    expect(stainsFor({ ...base, life: life("male", false, 30) })).toEqual([]);
    expect(stainsFor({ ...base, nodeId: "day30", life: life("male") })).toEqual([]);
  });
  it("看醫生（診間）、之後的劇情、離開節點就消失", () => {
    expect(stainsFor({ ...base, bg: "vet", pose: "table", life: life("male") })).toEqual([]);
    expect(stainsFor({ ...base, pose: "sit", life: life("male") })).toEqual([]);
    expect(stainsFor({ ...base, step: "report", life: life("male") })).toEqual([]);
  });
});

describe("尿漬位置", () => {
  const scene = houseScene([DEMO_DOLLHOUSE])[0];
  it("娃娃屋：在房間內、不壓到家具、彼此分開", () => {
    const stains = stainsFor({ ...base, life: life("male") });
    const spots = houseStainSpots(scene, stains);
    expect(spots).toHaveLength(3);
    for (const p of spots) expect(blocked(p.x, p.z, scene, obstacles(scene), p.r)).toBe(false);
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++)
      expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(0.3);
  });
  it("掃描房間：找不到紙箱就放牆角，座標在房間內", () => {
    const sc = { room: { min: [0, 0], max: [4, 3] }, objects: [] } as never;
    const layout = { cell: 1, nx: 40, ny: 30, units_per_meter: 10, walkable: "1".repeat(1200) } as never;
    const spots = scanStainSpots(sc, layout, stainsFor({ ...base, life: life("male") }));
    expect(spots).toHaveLength(3);
    for (const p of spots) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(4); expect(p.z).toBeGreaterThan(0); expect(p.z).toBeLessThan(3); }
  });
});

describe("blobOutline", () => {
  it("不規則但固定：同一個 id 每次一樣，半徑在 0.7～1.15 倍之間", () => {
    const a = blobOutline("s1", 0.3), b = blobOutline("s1", 0.3);
    expect(a).toEqual(b);
    for (const [x, y] of a) { const r = Math.hypot(x, y); expect(r).toBeGreaterThan(0.3 * 0.7 - 1e-9); expect(r).toBeLessThan(0.3 * 1.15 + 1e-9); }
  });
});

describe("farewellPhase", () => {
  it("結尾：睡著那一幕＝sleep，貓離開那一幕＝gone，其他＝null", () => {
    expect(farewellPhase({ step: "node", nodeId: "farewell", pose: "bed" })).toBe("sleep");
    expect(farewellPhase({ step: "node", nodeId: "farewell", pose: "none" })).toBe("gone");
    expect(farewellPhase({ step: "node", nodeId: "farewell", pose: "frail" })).toBeNull();
    expect(farewellPhase({ step: "node", nodeId: "year10", pose: "none" })).toBeNull();
    expect(farewellPhase({ step: "report", nodeId: "farewell", pose: "none" })).toBeNull();
  });
});
