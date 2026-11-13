import { describe, expect, it } from "vitest";
import { careGood } from "../care";
import { brushDifficulty, brushStep, newBrush, brushPointers, type BrushInput } from "./brush-rules";

const input: BrushInput = { dt: 0.1, holding: true, target: 0, travel: 0.06, near: true };
describe("3D 刷牙", () => {
  it("五階段各有不同目標，空等不能成功", () => {
    const modes = [0, 1, 2, 3, 4].map(level => brushDifficulty(100, 0, level));
    expect(new Set(modes.map(mode => mode.phase)).size).toBe(5);
    const state = newBrush(modes[4]);
    expect(brushStep(state, modes[4], { ...input, travel: 0 }).clean[0]).toBe(0);
  });

  it("只計算張嘴時刷到的牙，刷完整個指定範圍後照護成功", () => {
    const config = brushDifficulty(100, 0, 3);
    let state = newBrush(config);
    expect(brushStep(state, config, { ...input, holding: false }).clean[0]).toBe(0);
    for (let target = 0; target < 4; target++) {
      for (let i = 0; i < 8; i++) state = brushStep(state, config, { ...input, target });
    }
    expect(careGood("brush", state.result)).toBe(true);
  });

  it("信任低或壓力高時較早掙扎，且耐心較短", () => {
    const calm = brushDifficulty(100, 0, 4);
    const stressed = brushDifficulty(10, 85, 4);
    expect(stressed.struggleEvery).toBeLessThan(calm.struggleEvery);
    expect(stressed.patience).toBeLessThan(calm.patience);
    expect(brushDifficulty(100, 85, 4).patience).toBeLessThan(calm.patience);
  });

  it("掙扎時放手可以避免咬傷，持續施力則會被咬", () => {
    const config = brushDifficulty(0, 100, 4);
    const state = { ...newBrush(config), elapsed: config.struggleEvery + 0.1 };
    expect(brushStep(state, config, { ...input, holding: false }).pressure).toBe(0);
    let held = state;
    for (let i = 0; i < 8; i++) held = brushStep(held, config, input);
    expect(held.result).toMatchObject({ bitten: true, ran: false });
    expect(careGood("brush", held.result)).toBe(false);
  });

  it("耐心耗盡時跑掉，取消不算照護成功", () => {
    const config = brushDifficulty(100, 0, 4);
    const state = { ...newBrush(config), elapsed: config.patience - 0.05 };
    expect(brushStep(state, config, { ...input, holding: false }).result).toMatchObject({ ran: true });
    expect(careGood("brush", null)).toBe(false);
  });

  it("獨立追蹤嘴角和牙刷，放開或取消其中一指不會清除另一指", () => {
    const empty = { lip: null, tool: null };
    const lip = brushPointers(empty, 7, "lip");
    const both = brushPointers(lip, 9, "tool");
    expect(brushPointers(both, 8, "lip")).toBe(both);
    expect(brushPointers(lip, 7, "tool")).toBe(lip);
    expect(brushPointers(both, 7, "release")).toEqual({ lip: null, tool: 9 });
    expect(brushPointers(both, 9, "release")).toEqual(lip);
  });
});
