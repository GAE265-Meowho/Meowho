// 家具模型庫（#138）：程式裡的尺寸要和 Blender 產生的 kit.json 一致，每種家具都有 glb
// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FLOORPLAN_FURNITURE_KINDS } from "@/lib/ai/schemas";
import { FURNITURE_KIT, kitScale, kitUrl } from "./kit";

const dir = join(process.cwd(), "public/hq-floorplan/furniture");

describe("家具模型庫", () => {
  it("每種家具都有 glb，尺寸與 kit.json 一致", () => {
    const json = JSON.parse(readFileSync(join(dir, "kit.json"), "utf8")) as { kinds: Record<string, { w: number; d: number; ref_h: number }> };
    for (const kind of FLOORPLAN_FURNITURE_KINDS) {
      expect(existsSync(join(dir, `${kind}.glb`)), kind).toBe(true);
      const { w, d, ref_h } = json.kinds[kind];
      expect(FURNITURE_KIT[kind], kind).toEqual({ w, d, ref_h });
    }
  });
  it("縮放成讀圖結果的寬、高、深；不認得的種類用 other", () => {
    expect(kitScale("sofa", { w: 2.1, h: 0.8, d: 0.9 })).toEqual([1, 1, 1]);
    expect(kitScale("bed", { w: 0.9, h: 0.5, d: 1.9 })).toEqual([0.584, 1, 0.95]);
    expect(kitUrl("piano")).toBe("/hq-floorplan/furniture/other.glb");
  });
});
