import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SafetyReportDetails } from "./SafetyReportDetails";

const API_URL = "/api/homes/home-1/reports/report-1";
const ready = {
  report: { id: "report-1", status: "ready", published: true, demo: false, error: null },
  summary: "已完成安全評估",
  items: [{ key: "cable", label: "電線", level: "high", note: "先整理", cropUrl: "/api/crop" }],
  warnings: [],
  pdfUrl: API_URL + "/pdf",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ready }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SafetyReportDetails PDF-first states", () => {
  it("embeds the protected PDF route and offers direct download and open actions", async () => {
    render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    const frame = await screen.findByTitle("WelfareLens 完整居家安全報告 PDF");
    expect(frame.getAttribute("src")).toBe(API_URL + "/pdf");
    const download = screen.getByRole("link", { name: "下載 PDF" });
    expect(download.getAttribute("href")).toBe(API_URL + "/pdf?download=1");
    expect(download.getAttribute("target")).toBe("_blank");
    expect(download.getAttribute("rel")).toContain("noopener");
    expect(download.getAttribute("referrerpolicy")).toBe("no-referrer");
    const open = screen.getByRole("link", { name: "另開 PDF 檢視" });
    expect(open.getAttribute("href")).toBe(API_URL + "/pdf");
    expect(open.getAttribute("target")).toBe("_blank");
    expect(await screen.findByText("電線")).toBeTruthy();
    expect(screen.getByText("若手機仍以 PDF 預覽開啟，請使用瀏覽器或系統的分享選單儲存檔案。")).toBeTruthy();
    expect(screen.getByAltText("電線的風險裁切照").getAttribute("src")).toBe("/api/crop");
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
  });

  it("shows processing and failed report states without asset URLs", async () => {
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

  it("handles expired login or revoked access as a safe load error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    expect((await screen.findByRole("alert")).textContent).toContain("安全報告暫時無法載入");
  });

  it("uses a reauthorizing same-origin route so each reload gets a fresh Blob URL", async () => {
    render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    await waitFor(() => expect(screen.getByTitle("WelfareLens 完整居家安全報告 PDF")).toBeTruthy());
    expect(screen.getByTitle("WelfareLens 完整居家安全報告 PDF").getAttribute("src")).toBe(API_URL + "/pdf");
    expect(fetch).toHaveBeenCalledWith(API_URL, expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
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
    expect(screen.queryByRole("link", { name: "另開 PDF 檢視" })).toBeNull();
  });

  it("offers a retry when a crop request fails", async () => {
    render(<SafetyReportDetails householdId="home-1" reportId="report-1" />);
    const image = await screen.findByAltText("電線的風險裁切照");
    image.dispatchEvent(new Event("error"));
    expect(await screen.findByRole("button", { name: "裁切照載入失敗，點此重新載入" })).toBeTruthy();
  });
});
