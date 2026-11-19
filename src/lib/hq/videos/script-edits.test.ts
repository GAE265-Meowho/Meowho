import { describe, expect, it } from "vitest";
import { SHOT_SECTIONS } from "./trailer";
import {
  agentPrompt, editKey, editsMarkdown, effectiveEdits, prepareEdit, shotKey, shotValue, zhPromptOf, type ScriptEdit,
} from "./script-edits";

const shots = SHOT_SECTIONS.flatMap(s => s.shots);
const e = (target: string, field: ScriptEdit["field"], value: string | null, at: string): ScriptEdit =>
  ({ id: at, target, field, value, created_at: at, author: "Tina" });

describe("分鏡表編修（#513）", () => {
  it("鏡頭代號穩定且不重複，格式符合 0041 的 check", () => {
    const keys = shots.map(shotKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^s\d{2}$/);
    for (const f of shots.flatMap(s => s.frames)) expect(f.id).toMatch(/^s\d{2}(-\d)?$/);
  });

  it("同一欄最新一筆生效；最新是 null 就回到原稿", () => {
    const s = shots[0];
    const k = shotKey(s);
    const eff = effectiveEdits([e(k, "picture", "第一版", "2026-11-19T01:00:00Z"), e(k, "picture", "第二版", "2026-11-19T02:00:00Z")]);
    expect(shotValue(s, "picture", eff)).toBe("第二版");
    expect(eff.get(editKey(k, "picture"))!.count).toBe(2);
    const reverted = effectiveEdits([e(k, "picture", "第二版", "2026-11-19T02:00:00Z"), e(k, "picture", null, "2026-11-19T03:00:00Z")]);
    expect(shotValue(s, "picture", reverted)).toBe(s.picture);
  });

  it("寫入檢查：畫面不能空白、和原稿一樣存 null、中文 prompt 空白＝清除", () => {
    expect(prepareEdit("s01", "picture", "  ", "原稿").ok).toBe(false);
    expect(prepareEdit("s01", "picture", " 原稿 ", "原稿")).toEqual({ ok: true, row: { target: "s01", field: "picture", value: null } });
    expect(prepareEdit("s07-1", "zh_prompt", "  ", "")).toEqual({ ok: true, row: { target: "s07-1", field: "zh_prompt", value: null } });
    expect(prepareEdit("../x", "picture", "v", "o").ok).toBe(false);
    expect(prepareEdit("s01", "sfx", "x".repeat(3001), "o").ok).toBe(false);
  });

  it("給 AI agent 的 prompt：英文在前，中文補充在後；沒有中文就只有英文", () => {
    const s = shots[0];
    const f = s.frames[0];
    const eff = effectiveEdits([e(f.id, "zh_prompt", "紙箱要是上掀式、有膠帶", "2026-11-19T01:00:00Z")]);
    const p = agentPrompt(f, s.line, zhPromptOf(f, eff));
    expect(p).toContain(f.prompt);
    expect(p.endsWith("【中文補充】\n紙箱要是上掀式、有膠帶")).toBe(true);
    expect(agentPrompt(f, s.line, "")).not.toContain("中文補充");
  });

  it("匯出編修清單", () => {
    const s = shots[0];
    const eff = effectiveEdits([e(shotKey(s), "sfx", "雨聲加大", "2026-11-19T01:00:00Z")]);
    expect(editsMarkdown(eff)).toContain(`| 鏡 ${s.no} | 音效 | ${s.sfx} | 雨聲加大 |`);
    expect(editsMarkdown(new Map())).toContain("目前沒有編修");
  });
});
