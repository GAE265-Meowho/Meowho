import { describe, expect, it, vi } from "vitest";
import { accidentSteps, type Life, type Risk } from "./story";
import { canShowHazard, hazardDialogView, hazardReportTarget, loadReportHazard, pickReportItem, safeCropUrl, year5HazardMoment, type Year5MomentInput } from "./year5-hazard";

const HH = "11111111-1111-4111-8111-111111111111";
const RP = "22222222-2222-4222-8222-222222222222";
const crop = (k: string) => `/api/homes/${HH}/reports/${RP}/crops/${k}`;
const cable: Risk = { key: "cable", label: "電線與插座", level: "high", advice: "電線收進集線盒。" };
const base: Year5MomentInput = {
  step: "node", nodeId: "year5", sceneBg: "room", risk: cable,
  cur: { kind: "lines", lines: [{ t: "小叮嚀：電線收進集線盒。" }] },
  events: [{ node: "year5", id: "incident" }],
};

describe("year5HazardMoment", () => {
  it("送醫後回到家、出現小叮嚀時成立", () => {
    expect(year5HazardMoment(base)).toBe(true);
  });
  it("虛驚（沒送醫）在家出現小叮嚀時也成立", () => {
    expect(year5HazardMoment({ ...base, events: [{ node: "year5", id: "scare" }] })).toBe(true);
  });
  it("其他節點、還在醫院、沒有意外事件、沒有危險項目、不是台詞時都不成立", () => {
    expect(year5HazardMoment({ ...base, nodeId: "year10" })).toBe(false);
    expect(year5HazardMoment({ ...base, step: "report" })).toBe(false);
    expect(year5HazardMoment({ ...base, sceneBg: "vet" })).toBe(false);
    expect(year5HazardMoment({ ...base, events: [{ node: "month8", id: "incident" }] })).toBe(false);
    expect(year5HazardMoment({ ...base, risk: null })).toBe(false);
    expect(year5HazardMoment({ ...base, cur: { kind: "ask" } })).toBe(false);
    expect(year5HazardMoment({ ...base, cur: { kind: "lines", lines: [{ t: "一個平常的晚上" }] } })).toBe(false);
  });
  it("對得上劇情：送醫那條路最後是回到 room 再接小叮嚀", () => {
    const X = { name: "麻糬", risk: cable, events: [] } as unknown as Life;
    const steps = accidentSteps(X);
    const lastScene = [...steps].reverse().find(s => s.k === "scene");
    const last = steps[steps.length - 1];
    expect(lastScene).toMatchObject({ k: "scene", bg: "room" });
    expect(last.k === "line" && last.t.startsWith("小叮嚀：")).toBe(true);
    expect(X.events).toContainEqual(expect.objectContaining({ node: "year5", id: "incident" }));
  });
  it("對得上劇情：虛驚那條路一直在 room，最後是小叮嚀", () => {
    const X = { name: "麻糬", risk: { ...cable, key: "door" }, events: [] } as unknown as Life;
    const steps = accidentSteps(X);
    expect(steps.filter(s => s.k === "scene").every(s => s.k === "scene" && s.bg === "room")).toBe(true);
    const last = steps[steps.length - 1];
    expect(last.k === "line" && last.t.startsWith("小叮嚀：")).toBe(true);
    expect(X.events).toContainEqual(expect.objectContaining({ node: "year5", id: "scare" }));
  });
});

const body = (over: Record<string, unknown> = {}, report: Record<string, unknown> = {}) => ({
  report: { id: RP, status: "ready", published: true, demo: false, ...report },
  items: [
    { key: "window", label: "窗戶沒有紗窗", level: "high", note: "裝紗窗。", cropUrl: crop("window") },
    { key: "cable", label: "電線外露", level: "high", note: "電線收好。", cropUrl: crop("cable"), ...over },
  ],
});

describe("pickReportItem", () => {
  it("挑出對應 key，裁切照只收同源授權路由", () => {
    expect(pickReportItem(body(), HH, RP, "cable")).toEqual({
      key: "cable", label: "電線外露", level: "high", note: "電線收好。", cropUrl: crop("cable"), demo: false,
    });
    expect(pickReportItem(body({ cropUrl: "https://meowhomedia.blob.core.windows.net/x.jpg?sig=1" }), HH, RP, "cable")?.cropUrl).toBeNull();
    expect(safeCropUrl(crop("window"), HH, RP, "cable")).toBeNull();
  });
  it("示範報告沒有照片；沒發布、處理中、找不到都回 null", () => {
    expect(pickReportItem(body({}, { published: false, demo: true }), HH, RP, "cable")).toMatchObject({ demo: true, cropUrl: null });
    expect(pickReportItem(body({}, { published: false }), HH, RP, "cable")).toBeNull();
    expect(pickReportItem(body({}, { status: "running" }), HH, RP, "cable")).toBeNull();
    expect(pickReportItem(body(), HH, RP, "plant")).toBeNull();
    expect(pickReportItem(null, HH, RP, "cable")).toBeNull();
  });
});

describe("loadReportHazard", () => {
  it("只呼叫同源報告 API（帶 session cookie、不快取）", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(body()), { status: 200 }));
    const item = await loadReportHazard(HH, RP, "cable", f as unknown as typeof fetch);
    expect(item?.cropUrl).toBe(crop("cable"));
    expect(f).toHaveBeenCalledWith(`/api/homes/${HH}/reports/${RP}`, expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
  });
  it("沒登入（401）、沒權限（404）、網路錯誤都回 null", async () => {
    for (const status of [401, 404, 503]) {
      const f = vi.fn(async () => new Response("{}", { status }));
      expect(await loadReportHazard(HH, RP, "cable", f as unknown as typeof fetch)).toBeNull();
    }
    const bad = vi.fn(async () => { throw new Error("offline"); });
    expect(await loadReportHazard(HH, RP, "cable", bad as unknown as typeof fetch)).toBeNull();
  });
});

describe("hazardReportTarget／canShowHazard", () => {
  const ok = { demo: false, signedIn: true, householdId: HH, runReportId: RP };
  it("只用這一輪定格的報告", () => {
    expect(hazardReportTarget(ok)).toEqual({ householdId: HH, reportId: RP });
  });
  it("示範、沒登入、沒喵戶、沒有定格報告都不讀", () => {
    expect(hazardReportTarget({ ...ok, demo: true })).toBeNull();
    expect(hazardReportTarget({ ...ok, signedIn: false })).toBeNull();
    expect(hazardReportTarget({ ...ok, householdId: null })).toBeNull();
    expect(hazardReportTarget({ ...ok, runReportId: null })).toBeNull();
    expect(hazardReportTarget({ ...ok, runReportId: undefined })).toBeNull();
  });
  it("只有真實裁切照才跳", () => {
    const item = pickReportItem(body(), HH, RP, "cable");
    expect(canShowHazard(item)).toBe(true);
    expect(canShowHazard(item && { ...item, cropUrl: null })).toBe(false);
    expect(canShowHazard(item && { ...item, demo: true })).toBe(false);
    expect(canShowHazard(null)).toBe(false);
    expect(canShowHazard(undefined)).toBe(false);
  });
});

describe("hazardDialogView", () => {
  it("有報告項目：用報告名稱與照片，note 和小叮嚀不同時才另外顯示", () => {
    const item = pickReportItem(body(), HH, RP, "cable");
    expect(hazardDialogView(cable, item)).toEqual({
      label: "電線外露", level: "high", advice: "電線收進集線盒。", note: "電線收好。", cropUrl: crop("cable"), demo: false,
    });
    expect(hazardDialogView(cable, item && { ...item, note: "電線收進集線盒。" }).note).toBeNull();
  });
});
