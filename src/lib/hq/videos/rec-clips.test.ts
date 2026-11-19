import { describe, expect, it } from "vitest";
import { REC_CLIPS } from "./rec-clips";
import { SHOT_SECTIONS } from "./trailer";

describe("第三段系統錄影（#529）", () => {
  it("每支錄影都對到第三段的鏡頭，代號不重複且符合影片路徑規則", () => {
    const product = SHOT_SECTIONS.find(s => s.key === "product")!.shots.map(s => s.no);
    for (const c of REC_CLIPS) {
      expect(product, c.id).toContain(c.shot);
      expect(c.id).toMatch(/^rec-[a-z0-9-]+$/);
    }
    expect(new Set(REC_CLIPS.map(c => c.id)).size).toBe(REC_CLIPS.length);
  });

  it("鏡 15 到 24 每一顆產品鏡頭都有至少一支錄影", () => {
    const covered = new Set(REC_CLIPS.map(c => c.shot));
    for (const n of [15, 16, 17, 18, 22, 23, 24]) expect(covered.has(n), `鏡 ${n}`).toBe(true);
  });
});
