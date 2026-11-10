import { describe, expect, it } from "vitest";
import { isReportUuid, parseReportItems, reportAttemptPrefix, validReportCropPath, validReportPdfPath } from "./report-access";

const HOME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPORT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PREFIX = "homes/" + HOME + "/reports/" + REPORT + "/a2/";

describe("signed safety report paths", () => {
  it("accepts only valid IDs and a positive integer attempt", () => {
    expect(isReportUuid(HOME)).toBe(true);
    expect(isReportUuid("../../admin")).toBe(false);
    expect(reportAttemptPrefix(HOME, REPORT, 2)).toBe(PREFIX);
    expect(reportAttemptPrefix(HOME, REPORT, null)).toBeNull();
    expect(reportAttemptPrefix(HOME, REPORT, 0)).toBeNull();
    expect(reportAttemptPrefix(HOME, REPORT, 1.2)).toBeNull();
    expect(reportAttemptPrefix("../homes", REPORT, 2)).toBeNull();
  });

  it("requires exact PDF and crop names inside the claimed attempt", () => {
    expect(validReportPdfPath(PREFIX, PREFIX + "report.pdf")).toBe(true);
    expect(validReportPdfPath(PREFIX, PREFIX + "result.json")).toBe(false);
    expect(validReportPdfPath(PREFIX, PREFIX + "../a1/report.pdf")).toBe(false);
    expect(validReportPdfPath(PREFIX, "homes/other/report.pdf")).toBe(false);
    expect(validReportPdfPath(null, PREFIX + "report.pdf")).toBe(false);
    expect(validReportCropPath(PREFIX, "cable", PREFIX + "crops/cable.jpg")).toBe(true);
    expect(validReportCropPath(PREFIX, "cable", PREFIX + "crops/window.jpg")).toBe(false);
    expect(validReportCropPath(PREFIX, "cable", PREFIX + "crops/../report.pdf")).toBe(false);
    expect(validReportCropPath(PREFIX, "../secret", PREFIX + "crops/../secret.jpg")).toBe(false);
  });
});

describe("report items", () => {
  it("retains only five-column contract fields and never returns raw paths to the client", () => {
    expect(parseReportItems([{
      key: "cable", label: "電線", level: "high", note: "注意", crop_path: PREFIX + "crops/cable.jpg",
      frame_index: 2, t_s: 63, confidence: 0.9,
    }])).toEqual([{
      key: "cable", label: "電線", level: "high", note: "注意", cropPath: PREFIX + "crops/cable.jpg",
    }]);
  });

  it("drops invalid, duplicate or oversized items", () => {
    expect(parseReportItems([
      { key: "cable", label: "電線", level: "high", note: "注意" },
      { key: "cable", label: "重複", level: "low", note: "" },
      { key: "../bad", label: "不合法", level: "high", note: "" },
      { key: "ok", label: "長".repeat(21), level: "high", note: "" },
      { key: "ok2", label: "合法", level: "critical", note: "" },
    ])).toEqual([{ key: "cable", label: "電線", level: "high", note: "注意", cropPath: null }]);
    expect(parseReportItems({ items: [] })).toEqual([]);
  });
});
