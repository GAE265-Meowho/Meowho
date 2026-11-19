import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, draftFrom, formatLogTime, prepareGenLog, type GenLog } from "./gen-log";
import { SHOT_SECTIONS } from "./trailer";

describe("前導影片生成紀錄", () => {
  it("四段各有段落代號，和 0038 的 check 一致", () => {
    expect(SHOT_SECTIONS.map(s => s.key)).toEqual(["opening", "cross", "product", "ending"]);
  });

  it("工具與 prompt 必填", () => {
    const r = prepareGenLog("opening", EMPTY_DRAFT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["prompt", "tool"]);
  });

  it("去頭尾空白、空欄位存 null", () => {
    const r = prepareGenLog("opening", { ...EMPTY_DRAFT, tool: " Kling 4.0 ", prompt: "\nOne continuous take\n", settings: "  " });
    expect(r).toEqual({ ok: true, row: { section: "opening", tool: "Kling 4.0", prompt: "One continuous take", settings: null, inputs: null, negative_prompt: null, note: null } });
  });

  it("超過字數上限會擋", () => {
    const r = prepareGenLog("opening", { ...EMPTY_DRAFT, tool: "K", prompt: "p", note: "x".repeat(501) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.note).toBe("最多 500 字");
  });

  it("再用一次：帶入工具、設定、圖、prompt，不帶結果備註", () => {
    const log: GenLog = { id: "1", section: "opening", created_at: "2026-11-18T13:40:00Z", author: "Tina", tool: "Kling 4.0", settings: "Keyframes 10s 16:9", inputs: "s01, s02", prompt: "p", negative_prompt: "", note: "鏡頭沒越過箱頂" };
    expect(draftFrom(log)).toEqual({ tool: "Kling 4.0", settings: "Keyframes 10s 16:9", inputs: "s01, s02", prompt: "p", negative_prompt: "", note: "" });
  });

  it("時間以台北時間顯示", () => {
    expect(formatLogTime("2026-11-18T13:40:00Z")).toBe("2026/11/18 21:40");
  });
});
