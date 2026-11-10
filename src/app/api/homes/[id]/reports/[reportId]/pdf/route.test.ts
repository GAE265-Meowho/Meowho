// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const HOME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPORT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PREFIX = "homes/" + HOME + "/reports/" + REPORT + "/a1/";
const state = vi.hoisted(() => ({
  configured: true,
  loggedIn: true,
  owner: true,
  report: null as Record<string, unknown> | null,
  signed: [] as Array<{ path: string; ttl: number; options?: { contentDisposition?: string } }>,
  store: true,
}));

vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => !state.configured ? null : {
    auth: { getUser: async () => ({ data: { user: state.loggedIn ? { id: "owner" } : null }, error: null }) },
    from: (table: string) => ({
      select() { return this; },
      eq() { return this; },
      async maybeSingle() {
        return { data: table === "meow_households" ? (state.owner ? { id: HOME } : null) : state.report, error: null };
      },
    }),
  },
}));

vi.mock("@/lib/storage/server", () => ({
  getMediaStore: () => !state.store ? null : {
    readUrl: async (path: string, ttl: number, options?: { contentDisposition?: string }) => {
      state.signed.push({ path, ttl, options });
      return "https://example.invalid/private/report.pdf?sig=fake";
    },
  },
}));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: HOME, reportId: REPORT }) };
const req = (download = false) => new Request(
  "https://meowhome.test/api/homes/" + HOME + "/reports/" + REPORT + "/pdf" + (download ? "?download=1" : ""),
);

beforeEach(() => {
  state.configured = true;
  state.loggedIn = true;
  state.owner = true;
  state.report = {
    status: "ready", attempt: 1, pdf_path: PREFIX + "report.pdf", json_path: PREFIX + "result.json",
  };
  state.signed = [];
  state.store = true;
});

describe("owner-only PDF view / download redirects", () => {
  it("rejects unauthenticated users before signing", async () => {
    state.loggedIn = false;
    expect((await GET(req(), ctx)).status).toBe(401);
    expect(state.signed).toEqual([]);
  });

  it("rejects shared keepers and unrelated users", async () => {
    state.owner = false;
    expect((await GET(req(), ctx)).status).toBe(404);
    expect(state.signed).toEqual([]);
  });

  it("redirects directly to Azure with short-lived inline SAS", async () => {
    const response = await GET(req(), ctx);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("example.invalid");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(state.signed).toEqual([{ path: PREFIX + "report.pdf", ttl: 600, options: undefined }]);
  });

  it("signs an attachment response for direct Blob download without proxying PDF bytes", async () => {
    const response = await GET(req(true), ctx);
    expect(response.status).toBe(307);
    expect(state.signed).toEqual([{
      path: PREFIX + "report.pdf", ttl: 600,
      options: { contentDisposition: 'attachment; filename="WelfareLens-report.pdf"' },
    }]);
  });

  it("prevents downloading stale, missing and cross-attempt PDF paths", async () => {
    state.report = { status: "ready", attempt: 1, pdf_path: PREFIX + "../a2/report.pdf", json_path: PREFIX + "result.json" };
    expect((await GET(req(true), ctx)).status).toBe(404);
    state.report = { status: "queued", attempt: 1, pdf_path: PREFIX + "report.pdf", json_path: PREFIX + "result.json" };
    expect((await GET(req(), ctx)).status).toBe(404);
    state.report = { status: "ready", attempt: null, pdf_path: null, json_path: null };
    expect((await GET(req(), ctx)).status).toBe(404);
    expect(state.signed).toEqual([]);
  });

  it("handles unconfigured storage without disclosing private paths", async () => {
    state.store = false;
    const res = await GET(req(), ctx);
    expect(res.status).toBe(503);
    expect(state.signed).toEqual([]);
  });
});
