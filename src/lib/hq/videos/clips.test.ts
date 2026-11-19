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

  it("清單只有 AI 生成的 26 格，系統錄影與字卡不列", () => {
    expect(clipSections().flatMap(s => s.items)).toHaveLength(26);
    expect(clipSections().flatMap(s => s.items).every(i => i.frame.make === "ai")).toBe(true);
  });

  it("全片時間軸連續：鏡頭首尾相接，最後一鏡在 3:00 結束（#515）", () => {
    const toSec = (t: string) => { const [m, x] = t.split(":").map(Number); return m * 60 + x; };
    const all = SHOT_SECTIONS.flatMap(s => s.shots);
    for (let i = 1; i < all.length; i++) expect(all[i].time.split("–")[0], `鏡 ${all[i].no}`).toBe(all[i - 1].time.split("–")[1]);
    expect(toSec(all[all.length - 1].time.split("–")[1])).toBe(180);
    for (const sec of SHOT_SECTIONS) expect(sec.range, sec.key).toBe(`${sec.shots[0].time.split("–")[0]}–${sec.shots[sec.shots.length - 1].time.split("–")[1]}`);
  });

  it("鏡 27 小傑坐沙發抱小橘，prompt 寫明套房家具位置並掛小傑定角", () => {
    const s27 = SHOT_SECTIONS.flatMap(x => x.shots).find(s => s.no === 27)!;
    expect(s27.picture).toMatch(/^小傑坐在沙發抱著小橘/);
    const f = s27.frames[0];
    expect(f.refs).toEqual(["char-xiaoju", "char-xiaojie", "scene-studio"]);
    expect(f.prompt).toMatch(/gray .*sofa against the left wall/);
    expect(f.prompt).toMatch(/floor lamp/);
    expect(f.prompt).toMatch(/desk under the window/);
  });

  it("每一鏡都不超過 10 秒（#517 Tina 確認）", () => {
    for (const s of SHOT_SECTIONS.flatMap(x => x.shots)) expect(shotSeconds(s), `鏡 ${s.no}`).toBeLessThanOrEqual(10);
  });

  it("鏡 2 小橘說出被送回來的心聲，也說出想要一個長久的家（#517）", () => {
    const s2 = SHOT_SECTIONS[0].shots[1];
    expect(s2.voice).toMatch(/^小橘：「這是我第二次，被送回來。/);
    expect(s2.voice).toContain("不會再把我送走的家");
    expect(shotSeconds(s2)).toBeGreaterThanOrEqual(8);
  });

  it("鏡頭長度由分鏡表時間算出，多格平分；生成長度取 5、10 或 15 秒", () => {
    const s1 = shots[0];
    expect(shotSeconds(s1)).toBe(6); // 0:00–0:06
    expect(clipLength(s1)).toEqual({ cut: 6, generate: 10 });
    expect(clipLength(shots[1])).toEqual({ cut: 9, generate: 10 }); // 鏡 2 0:06–0:15（#517）
    const s5 = shots[4]; // 0:28–0:36，兩格
    expect(clipLength(s5)).toEqual({ cut: 4, generate: 5 });
    const s9 = shots[8]; // 0:58–1:08，查資料＋看電線兩格
    expect(clipLength(s9)).toEqual({ cut: 5, generate: 5 });
    const s15 = shots[14]; // 鏡 15 1:37–1:45，只有 1 格 AI
    expect(clipLength(s15)).toEqual({ cut: 8, generate: 10 });
  });

  it("圖生影片 prompt 有起始畫面檔名、依序的參考圖、動作與運鏡", () => {
    const f = shots[1].frames[0];
    const p = motionPrompt(f);
    expect(p.startsWith("Image-to-video. Start frame = s02.webp")).toBe(true);
    expect(p).toContain("Image 1 = char-xiaoju.webp");
    expect(p).toContain("Image 2 = scene-afang-home.webp");
    expect(p).toContain(`Action: ${CLIP_MOTION.s02.action}`);
    expect(p).toContain(`Camera: ${CLIP_MOTION.s02.camera}`);
    expect(p).toContain("No music, no voice"); // #504：生成時不要聲音
  });

  it("非 AI 的格子沒有圖生影片 prompt", () => {
    expect(motionPrompt(shots[5].frames[0])).toBe(""); // 鏡 6 群組分割畫面（動態設計，非 AI）
  });
});
