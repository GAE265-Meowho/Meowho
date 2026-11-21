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

  it("清單有 AI 生成的 28 格（#562 鏡 6 改 AI 兩格），加上第三段系統錄影的 5 格（真人＋真實 UI 合成，#547），再加鏡 14 Logo 字卡 1 格（成品上傳）", () => {
    const items = clipSections().flatMap(s => s.items);
    expect(items).toHaveLength(34);
    expect(items.filter(i => i.frame.make === "ai")).toHaveLength(28);
    expect(items.filter(i => i.frame.make === "record").map(i => i.frame.id)).toEqual(["s21", "s23", "s24", "s25", "s27"]);
    expect(items.filter(i => i.frame.make === "edit").map(i => i.frame.id)).toEqual(["s17"]);
  });

  it("系統錄影格沒有圖生影片 prompt，改看 SOP（#547）", () => {
    const rec = clipSections().flatMap(s => s.items).find(i => i.frame.id === "s21")!;
    expect(motionPrompt(rec.frame)).toBe("");
    expect(rec.cut).toBe(5);
  });

  it("全片時間軸連續：鏡頭首尾相接，最後一鏡在 3:00 結束（#515）", () => {
    const toSec = (t: string) => { const [m, x] = t.split(":").map(Number); return m * 60 + x; };
    const all = SHOT_SECTIONS.flatMap(s => s.shots);
    for (let i = 1; i < all.length; i++) expect(all[i].time.split("–")[0], `鏡 ${all[i].no}`).toBe(all[i - 1].time.split("–")[1]);
    expect(toSec(all[all.length - 1].time.split("–")[1])).toBe(180);
    for (const sec of SHOT_SECTIONS) expect(sec.range, sec.key).toBe(`${sec.shots[0].time.split("–")[0]}–${sec.shots[sec.shots.length - 1].time.split("–")[1]}`);
  });

  it("鏡 27 小傑坐沙發抱小橘，prompt 寫明套房家具位置（以 9-1 為準）並掛小傑定角", () => {
    const s27 = SHOT_SECTIONS.flatMap(x => x.shots).find(s => s.no === 27)!;
    expect(s27.picture).toMatch(/^小傑坐在沙發抱著小橘/);
    const f = s27.frames[0];
    expect(f.refs).toEqual(["char-xiaoju", "char-xiaojie", "scene-studio"]);
    expect(f.prompt).toMatch(/gray .*sofa against the left wall/);
    expect(f.prompt).toMatch(/floor lamp/);
    expect(f.prompt).toMatch(/desk under the right side of the window/);
  });

  it("鏡 5-2 夜間吹風機：小橘躲進貓床，筆記本字跡模糊，動作是關吹風機後記一筆（#530）", () => {
    const s5 = SHOT_SECTIONS.flatMap(x => x.shots).find(s => s.no === 5)!;
    expect(s5.picture).toContain("只有小橘嚇得跑到貓床躲起來");
    const f = s5.frames[1];
    expect(f.prompt).toMatch(/^Night/);
    expect(f.prompt).toMatch(/cat bed/);
    expect(f.prompt).not.toMatch(/sofa/);
    expect(f.prompt).toMatch(/unreadable/);
    expect(CLIP_MOTION["s07-2"].action).toMatch(/switches off the hair dryer/);
    expect(CLIP_MOTION["s07-2"].action).not.toMatch(/sofa/);
  });

  it("鏡 7 情侶在阿芳家門口從阿芳手上接過裝著小橘的外出籠（#537）", () => {
    const s7 = SHOT_SECTIONS.flatMap(x => x.shots).find(s => s.no === 7)!;
    expect(s7.picture).toContain("從阿芳手上接過裝著小橘的外出籠");
    expect(s7.frames[0].prompt).toMatch(/hands the pet carrier with the orange tabby cat inside/);
    expect(CLIP_MOTION.s11.action).toMatch(/hands over the pet carrier/);
    expect(CLIP_MOTION.s11.action).not.toMatch(/into her arms/);
  });

  it("鏡 9：9-1 門口廣角寫家具位置；9-2 改為蹲在桌下的特寫、只框書桌下方，9-1 → 9-2 剪接（#556）", () => {
    const [f1, f2] = SHOT_SECTIONS.flatMap(x => x.shots).find(s => s.no === 9)!.frames;
    expect(f1.prompt).toContain("do not move, add or remove any furniture");
    expect(f1.prompt).toMatch(/unreadable/);
    expect(f2.label).toBe("9-2 蹲下查看電線");
    expect(f2.prompt).toMatch(/9-1 image \(s10\.webp\) as the reference/);
    expect(f2.prompt).toMatch(/crouches on the floor/);
    expect(f2.prompt).toMatch(/only the area under the desk/);
    expect(f2.prompt).toMatch(/lower-left third/);
    expect(CLIP_MOTION.s10.action).toMatch(/pushes the chair back/);
  });


  it("鏡 11 同一雨夜坐到沙發拿手機、拇指懸著；第一格書桌照 9-1；後續套房鏡頭以 9-1 擺設為準（#543）", () => {
    const shots = SHOT_SECTIONS.flatMap(x => x.shots);
    const s11 = shots.find(s => s.no === 11)!;
    expect(s11.picture).toContain("坐到沙發");
    expect(s11.picture).toContain("拇指懸著");
    const f = s11.frames[0];
    expect(f.prompt).toContain("Room layout as in the 9-1 image (s10.webp)");
    expect(f.prompt).toMatch(/no extra side table or shelf/);
    expect(f.prompt).toMatch(/phone/);
    expect(f.prompt).not.toMatch(/mouse button/);
    expect(CLIP_MOTION.s15.action).toMatch(/thumb hovers/);
    for (const id of ["s16-2", "s20", "s28", "s29", "s30"]) {
      const x = shots.flatMap(s => s.frames).find(y => y.id === id)!;
      expect(x.prompt, id).toContain("Room layout as in the 9-1 image (s10.webp)");
    }
    expect(shots.find(s => s.no === 22)!.picture).toContain("呼應鏡 11：這次拇指沒有停");
  });

  it("鏡 11 片段卡拆成 4 支短片，第 ① 支用計畫圖第 2 格（#545）", () => {
    const s15 = SHOT_SECTIONS.flatMap(x => x.shots).flatMap(s => s.frames).find(f => f.id === "s15")!;
    expect(CLIP_MOTION.s15.cuts).toHaveLength(4);
    const p = motionPrompt(s15);
    expect(p).toContain("Clip ① start frame = panel 2");
    expect(p).toContain("Clip ② start frame = panel 5");
    expect(p).toContain("Clip ③ start frame = panel 13");
    expect(p).toContain("Clip ④ start frame = panel 15");
    expect(p).toContain("Generate each clip for 5 seconds");
    expect(p).toContain("rain ambience only");
    expect(p).not.toContain("no scene cuts");
  });

  it("鏡 6 改為 AI 兩格（6-1 阿芳發群組、6-2 小傑睡前滑群組），螢幕不讓 AI 畫字（#562）", () => {
    const s6 = SHOT_SECTIONS.flatMap(x => x.shots).find(s => s.no === 6)!;
    expect(s6.frames.map(f => [f.id, f.make, f.label])).toEqual([["s08-1", "ai", "6-1 阿芳發群組"], ["s08-2", "ai", "6-2 小傑睡前滑群組"]]);
    expect(s6.frames[0].refs).toEqual(["char-afang", "scene-afang-home"]);
    expect(s6.frames[1].refs).toEqual(["char-xiaojie", "scene-studio"]);
    for (const f of s6.frames) {
      expect(f.prompt).toMatch(/no readable text/);
      expect(CLIP_MOTION[f.id].action.length).toBeGreaterThan(0);
    }
  });

  it("每一鏡都不超過 10 秒（#517 Tina 確認）", () => {
    for (const s of SHOT_SECTIONS.flatMap(x => x.shots)) expect(shotSeconds(s), `鏡 ${s.no}`).toBeLessThanOrEqual(10);
  });

  it("鏡 2 小橘的心聲：第二次被送回來（#584，取代 #526 珮瑜版）", () => {
    const s2 = SHOT_SECTIONS[0].shots[1];
    expect(s2.voice).toBe("小橘：「這是我第二次被送回來……我是不是……不討人喜歡？」");
    expect(CLIP_MOTION.s02.action).toMatch(/shiver/);
    expect(CLIP_MOTION.s02.action).toMatch(/licks its lips/);
    expect(s2.voice).toContain("第二次被送回來");
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
    expect(motionPrompt(shots.find(s => s.no === 14)!.frames[0])).toBe(""); // 鏡 14 Logo 字卡（非 AI）
  });
});
