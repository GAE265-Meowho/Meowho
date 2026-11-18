import { describe, expect, it } from "vitest";
import { MINI_GUIDES, cueAt, guideKey, guidePart, guideSkipped, guideText, setGuideSkipped, toyAt, type GuideId } from "./mini-guide";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("小遊戲開始前的示範", () => {
  it("每個小遊戲都有 2～4 張示範圖，每張都有說明", () => {
    const ids: GuideId[] = ["feed", "water", "scoop", "pet", "brush", "nail", "play"];
    for (const id of ids) {
      const g = MINI_GUIDES[id];
      expect(g.steps.length, id).toBeGreaterThanOrEqual(2);
      expect(g.steps.length, id).toBeLessThanOrEqual(4);
      // 說明要短（2026-11-14 渝茜：約原本的 1/3）
      for (const s of g.steps) { expect(s.text.length, id).toBeGreaterThanOrEqual(4); expect(s.text.length, id).toBeLessThanOrEqual(12); }
    }
  });

  it("勾了「下次不再顯示」就記住，取消勾選就恢復", () => {
    const s = memory();
    expect(guideSkipped("feed", s)).toBe(false);
    setGuideSkipped("feed", true, s);
    expect(guideSkipped("feed", s)).toBe(true);
    expect(guideSkipped("water", s)).toBe(false);
    setGuideSkipped("feed", false, s);
    expect(guideSkipped("feed", s)).toBe(false);
    expect(guideKey("feed")).toBe("meowho.play.guide.v1.feed");
  });

  it("存不了（私密模式）也不會壞", () => {
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(guideSkipped("feed", broken)).toBe(false);
    expect(() => setGuideSkipped("feed", true, broken)).not.toThrow();
    expect(guideSkipped("feed", null)).toBe(false);
  });

  it("〈貓名〉換成這隻貓", () => {
    expect(guideText(MINI_GUIDES.play.steps[1].text, "灰寶")).toContain("灰寶");
  });
});

describe("說明疊在示範影片上（渝茜 2026-11-18）", () => {
  const ids: GuideId[] = ["feed", "water", "scoop", "pet", "brush", "nail", "play"];
  it("7 個小遊戲都有疊字，時間接續、位置在畫面內", () => {
    for (const id of ids) {
      const c = MINI_GUIDES[id].cues!;
      expect(c.length, id).toBeGreaterThan(1);
      c.forEach((x, i) => {
        expect(x.from, id).toBeLessThan(x.to);
        if (i) expect(x.from, id).toBe(c[i - 1].to);
        if (x.x !== undefined) { expect(x.x).toBeGreaterThanOrEqual(0); expect(x.x).toBeLessThanOrEqual(100); expect(x.y).toBeGreaterThanOrEqual(0); expect(x.y).toBeLessThanOrEqual(100); }
        if (x.hold) { expect(x.hold[0]).toBeGreaterThanOrEqual(x.from); expect(x.hold[0]).toBeLessThan(x.to); }
      });
    }
  });
  it("餵飯、換水 1.25 倍速，其他原速", () => {
    expect(ids.filter(id => MINI_GUIDES[id].rate === 1.25)).toEqual(["feed", "water"]);
  });
  it("剪指甲：電腦、手機都是三步，第三步提醒血線", () => {
    const steps = MINI_GUIDES.nail.cues!.filter(c => c.step).slice(0, 3);
    expect(steps.map(c => c.step)).toEqual(["① 按住肉球", "② 剪指甲", "③ 注意"]);
    expect(steps[2]).toMatchObject({ tone: "bad", d: "粉紅色是血線，剪到貓咪會流血" });
    expect(steps.every(c => c.hold)).toBe(true);
  });
  it("刷牙翻嘴角合成一句，加停格後至少 3 秒", () => {
    const first = MINI_GUIDES.brush.cues![0];
    expect(first.d).toContain("翻開嘴角");
    expect(first.to - first.from + (first.hold?.[1] ?? 0)).toBeGreaterThanOrEqual(3);
  });
  it("換水提醒煮沸過的水或過濾水；摸貓看煩躁、看得到搖桿", () => {
    expect(MINI_GUIDES.water.cues!.some(c => c.tip === "記得要用煮沸過的水或過濾水喔")).toBe(true);
    expect(MINI_GUIDES.pet.cues!.map(c => c.d).join("")).toMatch(/煩躁[^]*搖桿/);
    expect(MINI_GUIDES.pet.cues!.map(c => c.d).join("")).not.toContain("停手也是照顧");
  });
  it("文字標記：[動作]、{按鍵}、換行", () => {
    expect(guidePart("[按住]{空白鍵}翻開\n不要放")).toEqual([{ k: "verb", s: "按住" }, { k: "key", s: "空白鍵" }, { k: "t", s: "翻開" }, { k: "br" }, { k: "t", s: "不要放" }]);
  });
  it("依影片時間找說明；逗貓老鼠照路線移動", () => {
    const c = MINI_GUIDES.feed.cues!;
    expect(cueAt(c, 7)).toBe(2);
    expect(cueAt(c, -1)).toBe(0);
    expect(toyAt(MINI_GUIDES.play.toy!, 0.3)).toEqual([21, 51.5]);
    expect(toyAt(MINI_GUIDES.play.toy!, 8.72)).toEqual([64, 112]);
  });
});

describe("預載清單（#456）", () => {
  it("刷牙預載的檔案都真的放在 public/play/brush", async () => {
    const { existsSync } = await import("node:fs");
    const { BRUSH_PRELOAD } = await import("./mini-guide");
    for (const url of [...BRUSH_PRELOAD.images, ...BRUSH_PRELOAD.videos]) expect(existsSync(`public${url}`), url).toBe(true);
  });
  it("每個示範影片也都存在", async () => {
    const { existsSync } = await import("node:fs");
    const { GUIDE_VIDEOS } = await import("./mini-guide");
    for (const url of GUIDE_VIDEOS) expect(existsSync(`public${url}`), url).toBe(true);
  });
});
