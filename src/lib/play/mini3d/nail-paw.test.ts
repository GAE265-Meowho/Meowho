import { describe, expect, it } from "vitest";
import { aimAt, CLAW_LEN, clawPoint, PAW_PHOTO, PAW_TOES } from "./nail-paw";

describe("剪指甲底圖上的對位", () => {
  it("刀口放在某根指甲上，認得出是哪一根、剪在多深（斜的指甲也一樣）", () => {
    for (let toe = 0; toe < PAW_TOES.length; toe++) {
      for (const depth of [0.1, 0.38, 0.8]) {
        const p = clawPoint(toe, depth), aim = aimAt(p.x, p.y);
        expect(aim.toe).toBe(toe);
        expect(aim.depth).toBeCloseTo(depth, 5);
      }
    }
  });

  it("超出尖端一點點算剪在尖端；離指甲太遠、在肉球上都不算對到", () => {
    const tip = clawPoint(1, -0.1);
    expect(aimAt(tip.x, tip.y)).toEqual({ toe: 1, depth: 0 });
    expect(aimAt(160, 20).toe).toBeNull();
    for (const t of PAW_TOES) expect(aimAt(t.pad.x, t.pad.y).toe).toBeNull();
  });

  it("每根指甲伸出來都還在照片範圍內，彼此不重疊", () => {
    const tips = PAW_TOES.map((_, i) => clawPoint(i, 0));
    for (const p of tips) {
      expect(p.x).toBeGreaterThan(10);
      expect(p.x).toBeLessThan(PAW_PHOTO.size - 10);
      expect(p.y).toBeGreaterThan(10);
    }
    for (let i = 1; i < tips.length; i++) expect(Math.hypot(tips[i].x - tips[i - 1].x, tips[i].y - tips[i - 1].y)).toBeGreaterThan(CLAW_LEN * 0.7);
  });
});
