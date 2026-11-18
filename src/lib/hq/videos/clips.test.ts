import { describe, expect, it } from "vitest";
import { CLIP_MOTION, clipLength, clipSections, motionPrompt, shotSeconds } from "./clips";
import { SHOT_SECTIONS } from "./trailer";

const shots = SHOT_SECTIONS.flatMap(s => s.shots);
const aiFrames = shots.flatMap(s => s.frames).filter(f => f.make === "ai");

describe("前導影片：產生影片", () => {
  it("每一格 AI 分鏡都有動作與運鏡，沒有多出不存在的格子", () => {
    expect(Object.keys(CLIP_MOTION).sort()).toEqual(aiFrames.map(f => f.id).sort());
    for (const m of Object.values(CLIP_MOTION)) {
      expect(m.action.length).toBeGreaterThan(10);
      expect(m.camera.length).toBeGreaterThan(5);
    }
  });

  it("清單只有 AI 生成的 27 格，系統錄影與字卡不列", () => {
    expect(clipSections().flatMap(s => s.items)).toHaveLength(27);
    expect(clipSections().flatMap(s => s.items).every(i => i.frame.make === "ai")).toBe(true);
  });

  it("鏡頭長度由分鏡表時間算出，多格平分；生成長度取 5、10 或 15 秒", () => {
    const s1 = shots[0];
    expect(shotSeconds(s1)).toBe(6); // 0:00–0:06（#497）
    expect(clipLength(s1)).toEqual({ cut: 6, generate: 10 });
    expect(clipLength(shots[2])).toEqual({ cut: 14, generate: 15 }); // 鏡 3 0:16–0:30
    const s7 = shots[6]; // 1:05–1:15，兩格
    expect(clipLength(s7)).toEqual({ cut: 5, generate: 5 });
    const s13 = shots[12]; // 2:15–2:22
    expect(clipLength(s13)).toEqual({ cut: 7, generate: 10 });
    const s18 = shots[17]; // 3:08–3:20，只有 1 格 AI
    expect(clipLength(s18)).toEqual({ cut: 12, generate: 15 });
  });

  it("圖生影片 prompt 有起始畫面檔名、依序的參考圖、動作與運鏡", () => {
    const f = shots[1].frames[0];
    const p = motionPrompt(f);
    expect(p.startsWith("Image-to-video. Start frame = s02.webp")).toBe(true);
    expect(p).toContain("Image 1 = char-xiaoju.webp");
    expect(p).toContain("Image 2 = scene-afang-home.webp");
    expect(p).toContain(`Action: ${CLIP_MOTION.s02.action}`);
    expect(p).toContain(`Camera: ${CLIP_MOTION.s02.camera}`);
  });

  it("非 AI 的格子沒有圖生影片 prompt", () => {
    expect(motionPrompt(shots[8].frames[0])).toBe("");
  });
});
