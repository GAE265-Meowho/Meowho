import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SafetyReportDetails } from "./SafetyReportDetails";

const API_URL = "/api/homes/home-1/reports/report-1";
const ready = {
  report: { id: "report-1", status: "ready", published: true, demo: false, error: null },
  summary: "已完成安全評估",
  items: [{ key: "cable", label: "電線", level: "high", note: "先整理", cropUrl: "/api/crop" }],
  warnings: [{ code: "uncertain", message: "部分畫面仍需補拍確認。" }],
  pdfUrl: API_URL + "/pdf",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ready }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SafetyReportDetails HTML-summary-first states", () => {
  it("shows the HTML summary and risks before distinct PDF actions without requesting the PDF", async () => {
    render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    const summary = await screen.findByText("已完成安全評估");
    const details = summary.parentElement;
    expect(details?.firstElementChild).toBe(summary);
    expect(screen.queryByTitle("WelfareLens 完整居家安全報告 PDF")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(API_URL);
    const download = screen.getByRole("link", { name: "下載 PDF" });
    expect(download.getAttribute("href")).toBe(API_URL + "/pdf?download=1");
    expect(download.getAttribute("target")).toBe("_blank");
    expect(download.getAttribute("rel")).toContain("noopener");
    expect(download.getAttribute("referrerpolicy")).toBe("no-referrer");
    const open = screen.getByRole("link", { name: "檢視完整 PDF" });
    expect(open.getAttribute("href")).toBe(API_URL + "/pdf");
    expect(open.getAttribute("target")).toBe("_blank");
    expect(await screen.findByText("電線")).toBeTruthy();
    expect(screen.getByText("高風險")).toBeTruthy();
    expect(screen.getByText("先整理")).toBeTruthy();
    expect(screen.getByText("部分畫面仍需補拍確認。")).toBeTruthy();
    expect(screen.getByText(/手機若仍以預覽開啟，請從分享選單儲存/)).toBeTruthy();
    expect(screen.getByAltText("電線的風險裁切照").getAttribute("src")).toBe("/api/crop");
  });

  it("shows an empty summary message without hiding risk items", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ ...ready, summary: null }) } as Response);
    render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    const empty = await screen.findByText("尚未提供文字摘要，請參考下方風險項目。");
    expect(empty.parentElement?.firstElementChild).toBe(empty);
    expect(screen.getByText("電線")).toBeTruthy();
  });

  it("does not show broken PDF actions for a demo report", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...ready, report: { ...ready.report, published: false, demo: true }, pdfUrl: null }),
    } as Response);
    render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    expect(await screen.findByText(/示範報告（非真實 AI 分析）/)).toBeTruthy();
    expect(screen.queryByTitle("WelfareLens 完整居家安全報告 PDF")).toBeNull();
    expect(screen.queryByRole("link", { name: "下載 PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "檢視完整 PDF" })).toBeNull();
  });

  it("shows queued, running and failed states without asset URLs", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ ...ready, report: { ...ready.report, status: "queued" }, pdfUrl: null }),
    } as Response);
    const queued = render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    expect((await screen.findByRole("status")).textContent).toContain("安全報告仍在處理中");
    queued.unmount();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ ...ready, report: { ...ready.report, status: "running" }, pdfUrl: null }),
    } as Response);
    const first = render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    expect((await screen.findByRole("status")).textContent).toContain("安全報告仍在處理中");
    first.unmount();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...ready, report: { ...ready.report, status: "failed", error: "安全檢測未完成" }, pdfUrl: null }),
    } as Response);
    render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    expect((await screen.findByRole("alert")).textContent).toContain("安全檢測未完成");
  });

  it("hides PDF actions when a published report has no PDF", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ ...ready, pdfUrl: null }) } as Response);
    render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    expect(await screen.findByText("已完成安全評估")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "下載 PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "檢視完整 PDF" })).toBeNull();
  });

  it("handles expired login or revoked access as a safe load error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    expect((await screen.findByRole("alert")).textContent).toContain("安全報告暫時無法載入");
  });

  it("does not request a PDF route until the user selects a PDF action", async () => {
    render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    await screen.findByText("已完成安全評估");
    expect(fetch).toHaveBeenCalledWith(API_URL, expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/pdf"))).toBe(false);
  });

  it("keeps summary and crops for a shared keeper without any PDF action", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...ready, pdfUrl: null }),
    } as Response);
    render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    expect(await screen.findByText("電線")).toBeTruthy();
    expect(screen.getByAltText("電線的風險裁切照")).toBeTruthy();
    expect(screen.queryByTitle("WelfareLens 完整居家安全報告 PDF")).toBeNull();
    expect(screen.queryByRole("link", { name: "下載 PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "檢視完整 PDF" })).toBeNull();
  });

  it("offers a retry when a crop request fails", async () => {
    render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    const image = await screen.findByAltText("電線的風險裁切照");
    image.dispatchEvent(new Event("error"));
    expect(await screen.findByRole("button", { name: "裁切照載入失敗，點此重新載入" })).toBeTruthy();
  });
});
