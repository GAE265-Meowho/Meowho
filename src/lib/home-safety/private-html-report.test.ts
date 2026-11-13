import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { readPrivateReport } from "./private-html-report";

const mock = vi.hoisted(() => ({
  user: "owner", owner: true, report: true, download: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/server", () => ({ getMediaStore: () => ({ download: mock.download }) }));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: mock.user ? { id: mock.user } : null } }) },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: table === "meow_households" ? (mock.owner ? { id } : null)
            : mock.report ? { status: "ready", attempt: 1, pdf_path: prefix + "report.pdf", json_path: prefix + "result.json" } : null,
        }),
      };
      return query;
    },
  }),
}));

const id = "87218146-9b22-48c1-93f8-c64823cd04ab";
const reportId = "4f9a3c65-fa5d-430a-8f66-dd76d5daff99";
const prefix = `homes/${id}/reports/${reportId}/a1/`;
const image = Buffer.from("test image");
const asset = createHash("sha256").update(image).digest("hex") + ".jpg";

beforeEach(() => {
  Object.assign(mock, { user: "owner", owner: true, report: true });
  mock.download.mockReset().mockImplementation(async (path: string) =>
    path === prefix + "report.html" ? Buffer.from(`<!doctype html><img src="html-assets/${asset}">`) : image);
});

it("serves the owner document and referenced current-attempt image with private headers", async () => {
  const response = await readPrivateReport({ id, reportId });
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await readPrivateReport({ id, reportId }, asset)).status).toBe(200);
  expect(mock.download).toHaveBeenCalledWith(prefix + "html-assets/" + asset);
});

it("rejects logged-out, shared and unrelated reports before reading storage", async () => {
  mock.user = "";
  expect((await readPrivateReport({ id, reportId })).status).toBe(401);
  mock.user = "keeper";
  mock.owner = false;
  expect((await readPrivateReport({ id, reportId }, asset)).status).toBe(404);
  mock.owner = true;
  mock.report = false;
  expect((await readPrivateReport({ id, reportId })).status).toBe(404);
  expect(mock.download).not.toHaveBeenCalled();
});

it("redirects a legacy report and rejects malformed, unreferenced and corrupt assets", async () => {
  expect((await readPrivateReport({ id, reportId }, "../report.pdf")).status).toBe(404);
  expect((await readPrivateReport({ id, reportId }, "a".repeat(64) + ".png")).status).toBe(404);
  mock.download.mockImplementation(async (path: string) =>
    path.endsWith("report.html") ? Buffer.from(`<!doctype html><img src="html-assets/${asset}">`) : Buffer.from("corrupt"));
  expect((await readPrivateReport({ id, reportId }, asset)).status).toBe(404);
  mock.download.mockResolvedValue(null);
  expect((await readPrivateReport({ id, reportId })).status).toBe(303);
  expect((await readPrivateReport({ id, reportId }, asset)).status).toBe(404);
});
