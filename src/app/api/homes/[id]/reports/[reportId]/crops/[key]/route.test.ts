// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const HOME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPORT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PREFIX = "homes/" + HOME + "/reports/" + REPORT + "/a1/";
const state = vi.hoisted(() => ({
  loggedIn: true,
  owner: true,
  keeper: false,
  report: null as Record<string, unknown> | null,
  signed: [] as Array<{ path: string; ttl: number }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: state.loggedIn ? { id: "person-1" } : null }, error: null }) },
    from: (table: string) => ({
      select() { return this; },
      eq() { return this; },
      async maybeSingle() {
        return table === "meow_env_reports" ? { data: state.report, error: null }
          : { data: state.owner ? { id: HOME } : null, error: null };
      },
    }),
    rpc: async () => ({ data: state.keeper, error: null }),
  }),
}));
vi.mock("@/lib/storage/server", () => ({
  getMediaStore: () => ({
    readUrl: async (path: string, ttl: number) => {
      state.signed.push({ path, ttl });
      return "https://example.invalid/private/crop.jpg?sig=fake";
    },
  }),
}));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: HOME, reportId: REPORT, key: "cable" }) };
const req = () => new Request("https://meowhome.test/api/homes/" + HOME + "/reports/" + REPORT + "/crops/cable");
const readyReport = () => ({
  status: "ready", attempt: 1, pdf_path: PREFIX + "report.pdf", json_path: PREFIX + "result.json",
  items: [{ key: "cable", label: "電線", level: "high", note: "先整理", crop_path: PREFIX + "crops/cable.jpg" }],
});

beforeEach(() => {
  state.loggedIn = true;
  state.owner = true;
  state.keeper = false;
  state.report = readyReport();
  state.signed = [];
});

describe("same-origin crop capability route", () => {
  it("redirects to a short-lived crop URL after owner authorization", async () => {
    const response = await GET(req(), ctx);
    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(state.signed).toEqual([{ path: PREFIX + "crops/cable.jpg", ttl: 600 }]);
  });

  it("allows a keeper only after the report share is verified", async () => {
    state.owner = false;
    state.keeper = true;
    expect((await GET(req(), ctx)).status).toBe(307);
    state.keeper = false;
    expect((await GET(req(), ctx)).status).toBe(404);
  });

  it("rejects unauthenticated, unknown-key, and invalid-attempt requests without signing", async () => {
    state.loggedIn = false;
    expect((await GET(req(), ctx)).status).toBe(401);
    state.loggedIn = true;
    expect((await GET(req(), { params: Promise.resolve({ id: HOME, reportId: REPORT, key: "other" }) })).status).toBe(404);
    state.report = { ...readyReport(), attempt: 0 };
    expect((await GET(req(), ctx)).status).toBe(404);
    expect(state.signed).toEqual([]);
  });
});
