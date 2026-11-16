// 貓自己去磨爪（#354 第 2 份）：無聊時偶爾走到貓抓板旁、面向板子播 scratch。純函式。
import { describe, expect, it } from "vitest";
import { boredChoice, isScratcher, SCRATCH_SECONDS, scratchStand } from "./scratch";

describe("哪個用品是貓抓板", () => {
  it("遊戲的「貓抓板」、後台的「耐抓劍麻貓抓板」都算；貓砂盆、餐碗不算", () => {
    expect(isScratcher("貓抓板")).toBe(true);
    expect(isScratcher("耐抓劍麻貓抓板")).toBe(true);
    expect(isScratcher("貓砂盆")).toBe(false);
    expect(isScratcher("餐碗組")).toBe(false);
  });
});

describe("無聊時做什麼", () => {
  it("有貓抓板：大約一半去磨爪，其他照舊（跳上床或閒晃）", () => {
    expect(boredChoice(() => 0.1, { scratcher: true, bed: true })).toBe("scratch");
    expect(boredChoice(() => 0.9, { scratcher: true, bed: true })).toBe("bed");
    expect(boredChoice(() => 0.9, { scratcher: true, bed: false })).toBeNull();
  });
  it("沒擺貓抓板：照舊", () => {
    expect(boredChoice(() => 0.1, { scratcher: false, bed: true })).toBe("bed");
    expect(boredChoice(() => 0.1, { scratcher: false, bed: false })).toBeNull();
  });
  it("一次磨幾秒：三個循環左右", () => expect(SCRATCH_SECONDS).toBeGreaterThanOrEqual(2));
});

describe("磨爪站在哪", () => {
  const board = { x: 2, z: 2, widthM: 0.48, depthM: 0.72 };
  it("站在板子靠貓那一側的外面，面向板子中心；離板邊 gap", () => {
    const s = scratchStand(board, { x: 2, z: 0.5 }, 0.3);
    expect(s.x).toBeCloseTo(2);
    expect(s.z).toBeCloseTo(2 - 0.36 - 0.3);
    expect(s.heading).toBeCloseTo(0);  // 朝 +z（模型正面朝 +Z）
  });
  it("從側邊來：站在長邊外面", () => {
    const s = scratchStand(board, { x: 3.5, z: 2.1 }, 0.3);
    expect(s.x).toBeCloseTo(2 + 0.24 + 0.3);
    expect(s.z).toBeCloseTo(2);
    expect(s.heading).toBeCloseTo(-Math.PI / 2);
  });
});
