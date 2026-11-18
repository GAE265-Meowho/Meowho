import { describe, expect, it } from "vitest";
import {
  CHARACTERS, NARRATION, SCENES, SHOT_SECTIONS, allSlotIds, fitWithin, frameCounts, frameStoragePath,
  fullPrompt, latestBySlot, uploadProgress, validateFrameFile,
} from "./trailer";

const shots = SHOT_SECTIONS.flatMap(s => s.shots);

describe("前導影片 v3 分鏡資料", () => {
  it("30 顆鏡頭依序編號，每顆至少一格分鏡圖", () => {
    expect(shots.map(s => s.no)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    for (const s of shots) expect(s.frames.length).toBeGreaterThan(0);
  });

  it("需要產生 35 格：AI 生成 27、系統錄影截圖 5、剪輯字卡 3", () => {
    expect(frameCounts()).toEqual({ ai: 27, record: 5, edit: 3, total: 35 });
  });

  it("每一格上傳的代號都不重複，且只用小寫英數與減號（存檔路徑用）", () => {
    const ids = allSlotIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(ids).toHaveLength(CHARACTERS.length + SCENES.length + 35);
  });

  it("定角、定景標的鏡頭都存在", () => {
    const nos = new Set(shots.map(s => s.no));
    for (const r of [...CHARACTERS, ...SCENES]) for (const n of r.usedIn) expect(nos.has(n)).toBe(true);
  });

  it("旁白只有小橘與小傑兩個聲線", () => {
    expect(new Set(NARRATION.map(n => n.who))).toEqual(new Set(["橘", "傑"]));
  });

  it("AI 鏡頭的完整 prompt 加上風格尾巴，貓線再加低機位；非 AI 的格子原樣", () => {
    const s1 = shots[0];
    const p = fullPrompt(s1.frames[0], s1.line);
    expect(p).toContain("35mm film look");
    expect(p.endsWith("low camera angle at cat eye level")).toBe(true);
    const s9 = shots[8];
    expect(fullPrompt(s9.frames[0], s9.line)).toBe(s9.frames[0].prompt);
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
      s01: { name: "s01__20261118090000.webp", versions: 2 },
      "char-xiaoju": { name: "char-xiaoju__20261118070000.webp", versions: 1 },
    });
  });

  it("進度分定角、定景、分鏡圖三類", () => {
    const p = uploadProgress(latestBySlot(["s01__20261118080000.webp", "scene-studio__20261118080000.webp"]));
    expect(p).toEqual({
      characters: { done: 0, total: 4 },
      scenes: { done: 1, total: 3 },
      frames: { done: 1, total: 35 },
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
});
