import { afterEach, describe, expect, it, vi } from "vitest";
import { formatHqVersionDate, hqPageMeta, hqUpdatedBy, hqVersionDate } from "./build-meta";

describe("build-meta", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("formatHqVersionDate 為 yyyy/mm/dd hh:mm:ss", () => {
    const s = formatHqVersionDate(new Date("2026-11-05T05:08:09.000Z")); // UTC → Taipei +8
    expect(s).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(s).toBe("2026/11/05 13:08:09");
  });

  it("hqVersionDate／hqUpdatedBy 讀 NEXT_PUBLIC_*（fallback）", () => {
    vi.stubEnv("NEXT_PUBLIC_HQ_VERSION", "2026/01/02 03:04:05");
    vi.stubEnv("NEXT_PUBLIC_HQ_UPDATED_BY", "Tina");
    expect(hqVersionDate()).toBe("2026/01/02 03:04:05");
    expect(hqUpdatedBy()).toBe("Tina");
  });

  it("hqPageMeta 依 path／tab 回不同 key", () => {
    const hh = hqPageMeta("/MeowHQ/households");
    const exp = hqPageMeta("/MeowHQ/assets", "tab=experience");
    expect(hh.key).toBe("households");
    expect(exp.key).toBe("assets/experience");
    expect(hh.updatedBy.length).toBeGreaterThan(0);
    expect(hh.versionDate).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    // 兩頁應對應不同原始碼歷程（generated.json 內 households ≠ experience）
    expect(`${hh.updatedBy}|${hh.versionDate}`).not.toBe(`${exp.updatedBy}|${exp.versionDate}`);
  });
});
