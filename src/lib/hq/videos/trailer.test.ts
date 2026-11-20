import { describe, expect, it } from "vitest";
import {
  CHARACTERS, FRAME_REFS, NARRATION, SCENES, SHOT_SECTIONS, allSlotIds, refFileName, usedInShots, fitWithin, frameCounts, frameStoragePath,
  fullPrompt, isFrameFileName, latestBySlot, uploadProgress, validateFrameFile, withoutVersion,
} from "./trailer";

const shots = SHOT_SECTIONS.flatMap(s => s.shots);

describe("前導影片 v3 分鏡資料", () => {
  it("27 顆鏡頭依序編號，每顆至少一格分鏡圖（#515 縮為 3 分鐘）", () => {
    expect(shots.map(s => s.no)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
    for (const s of shots) expect(s.frames.length).toBeGreaterThan(0);
  });

  it("同一鏡有多格時，每格標籤都是「鏡號-序號 畫面」（例：5-1 拍小橘吃飯）", () => {
    for (const s of shots.filter(x => x.frames.length > 1)) {
      s.frames.forEach((f, i) => expect(f.label, f.id).toMatch(new RegExp(`^${s.no}-${i + 1} \\S`)));
    }
    expect(shots[4].frames.map(f => f.label)).toEqual(["5-1 拍小橘吃飯", "5-2 吹風機嚇到"]);
    expect(shots[8].frames.map(f => f.label)).toEqual(["9-1 查養貓注意事項", "9-2 蹲下查看電線"]);
  });

  it("需要產生 34 格：AI 生成 28、系統錄影截圖 5、剪輯字卡 1（#562 鏡 6 改 AI 兩格）", () => {
    expect(frameCounts()).toEqual({ ai: 28, record: 5, edit: 1, total: 34 });
  });

  it("每一格上傳的代號都不重複，且只用小寫英數與減號（存檔路徑用）", () => {
    const ids = allSlotIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(ids).toHaveLength(CHARACTERS.length + SCENES.length + 34);
  });

  it("每一格 AI 分鏡都有參考圖，最多 4 張，而且都是存在的定角／定景；非 AI 的格子沒有參考圖", () => {
    const refIds = new Set([...CHARACTERS, ...SCENES].map(r => r.id));
    for (const f of shots.flatMap(s => s.frames)) {
      if (f.make === "ai") {
        expect(f.refs.length, f.id).toBeGreaterThan(0);
        expect(f.refs.length, f.id).toBeLessThanOrEqual(4);
        for (const r of f.refs) expect(refIds.has(r), `${f.id} → ${r}`).toBe(true);
      } else expect(f.refs).toEqual([]);
    }
    const aiIds = new Set(shots.flatMap(s => s.frames).filter(f => f.make === "ai").map(f => f.id));
    for (const k of Object.keys(FRAME_REFS)) expect(aiIds.has(k), k).toBe(true);
  });

  it("每張定角／定景至少用在一顆鏡頭；用在哪些鏡頭由 refs 算出", () => {
    for (const r of [...CHARACTERS, ...SCENES]) expect(usedInShots(r.id).length, r.id).toBeGreaterThan(0);
    expect(usedInShots("char-couple")).toEqual([7, 10]);
    expect(usedInShots("scene-couple-home")).toEqual([8, 10]);
  });

  it("旁白只有小橘與小傑兩個聲線", () => {
    expect(new Set(NARRATION.map(n => n.who))).toEqual(new Set(["橘", "傑"]));
  });

  it("AI 鏡頭的完整 prompt 加上風格尾巴，貓線再加低機位；非 AI 的格子原樣", () => {
    const s1 = shots[0];
    const p = fullPrompt(s1.frames[0], s1.line);
    expect(p).toContain("35mm film look");
    expect(p.endsWith("low camera angle at cat eye level")).toBe(true);
    const s2 = shots[1];
    const p2 = fullPrompt(s2.frames[0], s2.line);
    expect(p2.startsWith("Reference images (attach in this order):\nImage 1 = char-xiaoju.webp: Xiaoju")).toBe(true);
    expect(p2).toContain("Image 2 = scene-afang-home.webp: Afang's ground-floor apartment");
    expect(p2).toContain(s2.frames[0].prompt);
    expect(refFileName("scene-studio")).toBe("scene-studio.webp");
    const s6 = shots.find(s => s.no === 14)!; // 鏡 14 Logo 字卡（非 AI）
    expect(fullPrompt(s6.frames[0], s6.line)).toBe(s6.frames[0].prompt);
  });
});

describe("上傳與進度", () => {
  it("存檔路徑帶 UTC 時間戳", () => {
    expect(frameStoragePath("s07-2", new Date("2026-11-18T08:05:09Z"))).toBe("videos/trailer/s07-2__20261118080509.webp");
  });

  it("每一格取最新一版並算版本數；不認得的檔名略過", () => {
    const got = latestBySlot([
      "s01__20261118080000.webp", "s01__20261118090000.webp", "char-xiaoju__20261118070000.webp",
      "s99__20261118070000.webp", "notes.txt", "s01__bad.webp",
    ]);
    expect(got).toEqual({
      s01: { name: "s01__20261118090000.webp", versions: 2, all: ["s01__20261118090000.webp", "s01__20261118080000.webp"] },
      "char-xiaoju": { name: "char-xiaoju__20261118070000.webp", versions: 1, all: ["char-xiaoju__20261118070000.webp"] },
    });
  });

  it("刪掉一版後，最新版換成下一版；刪光就沒有這一格（#547）", () => {
    const u = latestBySlot(["s01__20261118080000.webp", "s01__20261118090000.webp"]);
    expect(withoutVersion(u, "s01__20261118090000.webp").s01).toEqual({ name: "s01__20261118080000.webp", versions: 1, all: ["s01__20261118080000.webp"] });
    expect(withoutVersion(withoutVersion(u, "s01__20261118090000.webp"), "s01__20261118080000.webp").s01).toBeUndefined();
  });

  it("只有分鏡格自己的檔名可以刪（#547）", () => {
    expect(isFrameFileName("s18__20261119063730.webp")).toBe(true);
    expect(isFrameFileName("char-afang__20261118124127.webp")).toBe(true);
    expect(isFrameFileName("../s18__20261119063730.webp")).toBe(false);
    expect(isFrameFileName("s99__20261119063730.webp")).toBe(false);
    expect(isFrameFileName("s18__20261119063730.png")).toBe(false);
  });

  it("進度分定角、定景、分鏡圖三類", () => {
    const p = uploadProgress(latestBySlot(["s01__20261118080000.webp", "scene-studio__20261118080000.webp"]));
    expect(p).toEqual({
      characters: { done: 0, total: 4 },
      scenes: { done: 1, total: 3 },
      frames: { done: 1, total: 34 },
    });
  });

  it("只收 PNG、JPG、WebP，原始檔上限 30 MB", () => {
    expect(validateFrameFile({ type: "image/png", size: 5_000_000 })).toEqual({ ok: true });
    expect(validateFrameFile({ type: "image/gif", size: 10 }).ok).toBe(false);
    expect(validateFrameFile({ type: "image/jpeg", size: 31 * 1024 * 1024 }).ok).toBe(false);
  });

  it("縮圖等比例、最長邊 1920、不放大", () => {
    expect(fitWithin(3840, 2160)).toEqual({ w: 1920, h: 1080 });
    expect(fitWithin(1024, 1536)).toEqual({ w: 1024, h: 1536 });
    expect(fitWithin(2000, 3000)).toEqual({ w: 1280, h: 1920 });
  });
  it("鏡 3、鏡 4 有時間字卡，旁白不變（#568）", () => {
    expect(shots[2].voice).toBe("小傑：「我想養一隻貓，想了兩年。」字卡（左下約 2 秒）：「同一個雨夜．台北」");
    expect(shots[3].voice).toBe("小橘：「第一次遇見阿芳，是在一個很冷的晚上。」字卡（左下約 2 秒，倒敘）：「半年前」");
  });
});
