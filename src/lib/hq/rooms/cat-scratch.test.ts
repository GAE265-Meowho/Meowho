// 掃描房間的貓走到貓抓板旁磨爪（#354）：到了播 scratch、待 SCRATCH_SECONDS 秒。不開畫面。
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/play/audio-player", () => ({ playSfx: () => {} }));
import * as THREE from "three";
import { RoomCat } from "./cat";
import { SCRATCH_SECONDS } from "@/lib/play/scratch";

describe("走到貓抓板旁磨爪", () => {
  it("goTo 帶 scratch：走到後播磨爪、面向板子待 SCRATCH_SECONDS 秒", () => {
    const nx = 30, ny = 30;
    const cat = new RoomCat({ origin: [0, 0, 0], e1: [1, 0, 0], up: [0, 1, 0], e2: [0, 0, 1], units_per_meter: 1, nx, ny, cell: 0.1, walkable: "1".repeat(nx * ny) });
    const played: string[] = [];
    const c = cat as unknown as { mixer: unknown; actions: Record<string, unknown>; playClip: (n: string) => void; state: string; timer: number };
    c.mixer = { update() {} };
    c.actions = { scratch: {} };
    c.playClip = (n: string) => { played.push(n); };
    cat.place(5 * nx + 5);
    expect(cat.goTo(5 * nx + 20, new THREE.Vector2(2.5, 0.55), "scratch")).toBe(true);
    for (let f = 0; f < 600 && c.state === "walk"; f++) cat.update(1 / 30);
    expect(c.state).toBe("idle");
    expect(played).toContain("scratch");
    expect(c.timer).toBeCloseTo(SCRATCH_SECONDS, 0);
  });
});
