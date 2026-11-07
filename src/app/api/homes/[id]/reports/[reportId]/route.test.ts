// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const HOME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PATH = "homes/" + HOME + "/reports/" + ID + "/a1/";
const state = vi.hoisted(() => ({
  configured: true,
  loggedIn: true,
  report: null as Record<string, unknown> | null,
  reportError: false,
  owner: true,
  keeper: false,
  media: true,
  signed: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => !state.configured ? null : {
    auth: { getUser: async () => ({ data: { user: state.loggedIn ? { id: "person-1" } : null }, error: null }) },
    from: (table: string) => ({
      select() { return this; },
      eq() { return this; },
      async maybeSingle() {
        return table === "meow_env_reports"
          ? { data: state.report, error: state.reportError ? { message: "db" } : null }
          : { data: state.owner ? { id: HOME } : null, error: null };
      },
    }),
    rpc: async () => ({ data: state.keeper, error: null }),
  },
}));
vi.mock("@/lib/storage/server", () => ({
  getMediaStore: () => !state.media ? null : {
    readUrl: async (path: string, ttl: number) => {
      if (ttl !== 600) throw Error("incorrect TTL");
      state.signed.push(path);
      return "https://private.invalid/read?file=" + encodeURIComponent(path);
    },
  },
}));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: HOME, reportId: ID }) };
const request = () => new Request("http://localhost/api/homes/" + HOME + "/reports/" + ID);
const publishedReport = () => ({
  id: ID, household_id: HOME, room_model_id: null,
  status: "ready", attempt: 1,
  pdf_path: PATH + "report.pdf", json_path: PATH + "result.json",
  summary: "已觀察到電線", warnings: [], error: null,
  created_at: "2026-11-07T00:00:00Z", ready_at: "2026-11-07T00:01:00Z",
  items: [{ key: "cable", label: "電線", level: "high", note: "先整理", crop_path: PATH + "crops/cable.jpg" }],
});

beforeEach(() => {
  state.configured = true;
  state.loggedIn = true;
  state.report = publishedReport();
  state.reportError = false;
  state.owner = true;
  state.keeper = false;
  state.media = true;
  state.signed = [];
});

describe("GET owner / keeper safety report", () => {
  it("rejects unauthenticated access", async () => {
    state.loggedIn = false;
    const res = await GET(request(), ctx);
    expect(res.status).toBe(401);
    expect(state.signed).toEqual([]);
  });

  it("hides reports that are absent or blocked by RLS", async () => {
    state.report = null;
    const res = await GET(request(), ctx);
    expect(res.status).toBe(404);
    expect(state.signed).toEqual([]);
  });

  it("requires explicit keeper share, even if a row was visible", async () => {
    state.owner = false;
    state.keeper = false;
    const res = await GET(request(), ctx);
    expect(res.status).toBe(404);
    expect(state.signed).toEqual([]);
  });

  it("gives only the household owner the PDF URL", async () => {
    const res = await GET(request(), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(body.report.published).toBe(true);
    expect(body.pdfUrl).toContain("report.pdf");
    expect(body.items[0].cropUrl).toContain("cable.jpg");
    expect(state.signed).toEqual([PATH + "crops/cable.jpg", PATH + "report.pdf"]);
    expect(JSON.stringify(body)).not.toContain("crop_path");
    expect(JSON.stringify(body)).not.toContain("json_path");
  });

  it("lets a verified keeper read summary/crops but not PDF", async () => {
    state.owner = false;
    state.keeper = true;
    const res = await GET(request(), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.summary).toBe("已觀察到電線");
    expect(body.pdfUrl).toBeNull();
    expect(state.signed).toEqual([PATH + "crops/cable.jpg"]);
  });

  it("does not sign paths from another report or attempt", async () => {
    state.report = { ...publishedReport(), pdf_path: PATH.replace("/a1/", "/a2/") + "report.pdf" };
    const res = await GET(request(), ctx);
    const body = await res.json();
    expect(body.report.published).toBe(false);
    expect(body.items).toEqual([]);
    expect(body.pdfUrl).toBeNull();
    expect(state.signed).toEqual([]);
  });

  it("keeps P1 standalone demo items visible without signing any Blob URLs", async () => {
    state.report = { ...publishedReport(), pdf_path: null, json_path: null, attempt: null };
    const res = await GET(request(), ctx);
    const body = await res.json();
    expect(body.report.published).toBe(false);
    expect(body.report.demo).toBe(true);
    expect(body.summary).toBe("已觀察到電線");
    expect(body.items).toEqual([{ key: "cable", label: "電線", level: "high", note: "先整理", cropUrl: null }]);
    expect(body.pdfUrl).toBeNull();
    expect(state.signed).toEqual([]);
  });

  it("does not pass off an incomplete real attempt as a demo report", async () => {
    state.report = { ...publishedReport(), pdf_path: null };
    const body = await (await GET(request(), ctx)).json();
    expect(body.report.published).toBe(false);
    expect(body.report.demo).toBe(false);
    expect(body.items).toEqual([]);
    expect(body.pdfUrl).toBeNull();
    expect(state.signed).toEqual([]);
  });

  it("hides paths before a report is ready", async () => {
    state.report = { ...publishedReport(), status: "running" };
    const res = await GET(request(), ctx);
    expect((await res.json()).pdfUrl).toBeNull();
    expect(state.signed).toEqual([]);
  });

  it("returns a service error without leaking paths when storage is unavailable", async () => {
    state.media = false;
    const res = await GET(request(), ctx);
    expect(res.status).toBe(503);
    expect(state.signed).toEqual([]);
  });

  it("ignores injected crop paths and signs only the PDF", async () => {
    state.report = { ...publishedReport(), items: [
      { key: "cable", label: "電線", level: "high", note: "先整理", crop_path: "homes/other/secret.jpg" },
    ] };
    const res = await GET(request(), ctx);
    expect((await res.json()).items[0].cropUrl).toBeNull();
    expect(state.signed).toEqual([PATH + "report.pdf"]);
  });
});
