import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readReportView, renderPrivateReportView } from "./private-report-view";
import { ReportViewSchema } from "./report-view-contract";

const reportId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const household = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const asset = (digit: string, mime: "image/jpeg" | "image/png" = "image/jpeg") => ({
  sha256: digit.repeat(64), name: digit.repeat(64) + (mime === "image/png" ? ".png" : ".jpg"),
  mime, width: 640, height: 360,
});
const fixture = {
  schema: "meow_report_view/1", report_id: reportId, attempt: 1,
  improvements: [{
    id: "cord", label: "外露線材 <script>alert(1)</script>", action: "收整線材", hazard_category: "電線",
    facts: ["可見外露線材"], inferences: ["貓咪可能啃咬線材"], unverified: ["再次檢查可接近範圍"],
    evidence: [{ observation_id: "obs", frame_id: "f000", timestamp: 0, frame_sha256: asset("a").sha256 }],
    comparisons: [{ id: "case1", observation_id: "obs", before: asset("a"), after: asset("b", "image/png"),
      before_detail: asset("c"), after_detail: asset("d"), before_region: { bbox: [.2, .2, .4, .4], source: "ai_estimated" },
      after_region: { bbox: [.25, .2, .45, .4], source: "aligned_original_region" }, status: "ai_simulated_not_verified" }],
  }],
  confirmations: [{ id: "window", label: "窗戶", conditions: ["查核防墜設施"] }],
  statistics: { improvements: 1, confirmations: 1, evidence_frames: 1, hazards: [{ label: "電線", count: 1 }] },
};

describe("private report view v1", () => {
  it("validates the optional file and refuses incompatible or foreign attempt data", async () => {
    for (const [payload, expected] of [
      [fixture, true],
      [{ ...fixture, attempt: 2 }, false],
      [{ ...fixture, schema: "meow_report_view/2" }, false],
      [{ ...fixture, statistics: { ...fixture.statistics, improvements: 2 } }, false],
    ] as const) {
      const download = vi.fn().mockResolvedValue(Buffer.from(JSON.stringify(payload)));
      expect(Boolean(await readReportView({ download } as never, "attempt/", reportId, 1))).toBe(expected);
      expect(download).toHaveBeenCalledWith("attempt/report-view.json");
    }
  });

  it("keeps four deferred assets inside a native disclosure and honors old item links", () => {
    const view = ReportViewSchema.parse(fixture);
    const summary = renderPrivateReportView(household, view);
    const detail = renderPrivateReportView(household, view, 0);
    expect(summary).toContain("需要改善（1）");
    expect(summary).toContain('href="/me">返回我的喵戶');
    expect(summary).toContain("查核防墜設施");
    expect(summary).toContain('<details class="meow-item">');
    expect(summary.match(/style="--evidence-image:url/g)).toHaveLength(4);
    expect(detail).toContain('<details class="meow-item" open>');
    expect(detail.match(/role="img"/g)).toHaveLength(4);
    expect(detail).toContain("綠色虛線為 AI 模擬對應區域");
    expect(detail).not.toContain("<script>");
    expect(detail).toContain('href="pdf"');
  });
});
