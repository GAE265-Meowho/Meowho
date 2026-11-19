import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { readPrivateReport } from "./private-html-report";

const mock = vi.hoisted(() => ({
  user: "owner", owner: true, report: true, attempt: 1, download: vi.fn(),
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
            : mock.report ? { status: "ready", attempt: mock.attempt, pdf_path: prefix + "report.pdf", json_path: prefix + "result.json" } : null,
        }),
      };
      return query;
    },
  }),
}));

const id = "87218146-9b22-48c1-93f8-c64823cd04ab";
let caseNumber = 0;
let reportId: string;
let prefix: string;
const image = Buffer.from("test image");
const asset = createHash("sha256").update(image).digest("hex") + ".jpg";

beforeEach(() => {
  reportId = `4f9a3c65-fa5d-430a-8f66-${String(++caseNumber).padStart(12, "0")}`;
  prefix = `homes/${id}/reports/${reportId}/a1/`;
  Object.assign(mock, { user: "owner", owner: true, report: true, attempt: 1 });
  mock.download.mockReset().mockImplementation(async (path: string) =>
    path === prefix + "report.html" ? Buffer.from(`<!doctype html><body><img src="html-assets/${asset}"></body>`) : image);
});

it("serves the owner document and referenced current-attempt image with private headers", async () => {
  const response = await readPrivateReport({ id, reportId });
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('/safety#records-title');
  const head = await readPrivateReport({ id, reportId }, undefined, true);
  expect(head.status).toBe(204);
  expect(await head.text()).toBe("");
  expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await readPrivateReport({ id, reportId }, asset)).status).toBe(200);
  expect(mock.download).toHaveBeenCalledWith(prefix + "html-assets/" + asset);
});

it("updates only the known report header, preserving matching content elsewhere", async () => {
  const body = '<p class="kicker">WelfareLens × MeowHome</p>';
  const heading = "<h1>貓咪居家環境健檢</h1>";
  mock.download.mockResolvedValueOnce(Buffer.from(
    `<!doctype html><body><header>${body}${heading}</header><main>${body}${heading}</main></body>`,
  ));
  const response = await readPrivateReport({ id, reportId }, undefined, false, true);
  const html = await response.text();
  expect(html).toContain('<header><p class="kicker">MeowHome｜AI 居家環境安全檢測</p>');
  expect(html).toContain("<h1>貓咪居家環境健檢報告</h1>");
  expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
  expect(response.headers.get("Content-Security-Policy")).toContain("sandbox allow-same-origin allow-downloads");
  expect(html).toContain(`<main>${body}${heading}</main>`);
});

it("rejects logged-out, shared and unrelated reports before reading storage", async () => {
  mock.user = "";
  expect((await readPrivateReport({ id, reportId })).status).toBe(401);
  mock.user = "keeper";
  mock.owner = false;
  expect((await readPrivateReport({ id, reportId }, asset)).status).toBe(404);
  expect((await readPrivateReport({ id, reportId }, undefined, true)).status).toBe(404);
  mock.owner = true;
  mock.report = false;
  expect((await readPrivateReport({ id, reportId })).status).toBe(404);
  expect(mock.download).not.toHaveBeenCalled();
});

it("redirects a legacy report and rejects malformed, unreferenced and corrupt assets", async () => {
  expect((await readPrivateReport({ id, reportId }, "../report.pdf")).status).toBe(404);
  expect((await readPrivateReport({ id, reportId }, "a".repeat(64) + ".png")).status).toBe(404);
  mock.download.mockImplementation(async (path: string) =>
    path.endsWith("report.html") ? Buffer.from(`<!doctype html><body><img src="html-assets/${asset}"></body>`) : Buffer.from("corrupt"));
  expect((await readPrivateReport({ id, reportId }, asset)).status).toBe(404);
  mock.download.mockResolvedValue(null);
  const legacy = await readPrivateReport({ id, reportId });
  expect(legacy.status).toBe(303);
  expect(legacy.headers.get("Location")).toBe(`/homes/${id}/safety?view=summary&report=${reportId}`);
  expect((await readPrivateReport({ id, reportId }, undefined, true)).status).toBe(404);
  expect((await readPrivateReport({ id, reportId }, asset)).status).toBe(404);
});

it("coalesces image reference downloads but revalidates ownership on a cache hit", async () => {
  const results = await Promise.all([
    readPrivateReport({ id, reportId }, asset),
    readPrivateReport({ id, reportId }, asset),
  ]);
  expect(results.map(response => response.status)).toEqual([200, 200]);
  expect(mock.download.mock.calls.filter(([path]) => path.endsWith("report.html"))).toHaveLength(1);
  mock.owner = false;
  expect((await readPrivateReport({ id, reportId }, asset)).status).toBe(404);
  mock.owner = true;
  mock.report = false;
  expect((await readPrivateReport({ id, reportId }, asset)).status).toBe(404);
});

it("does not reuse an image whitelist across report attempts", async () => {
  expect((await readPrivateReport({ id, reportId }, asset)).status).toBe(200);
  mock.attempt = 2;
  prefix = prefix.replace(/a1\/$/, "a2/");
  mock.download.mockImplementation(async (path: string) =>
    path.endsWith("report.html") ? Buffer.from("<!doctype html><body>新版報告</body>") : image);
  expect((await readPrivateReport({ id, reportId }, asset)).status).toBe(404);
  expect(mock.download).not.toHaveBeenCalledWith(prefix + "html-assets/" + asset);
});
it("uses an authorized optional view without fetching historical HTML, then falls back on an invalid version", async () => {
  vi.stubEnv("MEOWHOME_PRIVATE_REPORT_VIEW", "true");
  try {
    const view = { schema: "meow_report_view/1", report_id: reportId, attempt: 1,
      improvements: [], confirmations: [], statistics: { improvements: 0, confirmations: 0, evidence_frames: 0, hazards: [] } };
    mock.download.mockImplementation(async (path: string) => path.endsWith("report-view.json")
      ? Buffer.from(JSON.stringify(view)) : Buffer.from("<!doctype html><body>歷史完整報告</body>"));
    const response = await readPrivateReport({ id, reportId });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("需要改善（0）");
    expect(mock.download.mock.calls).toEqual([[prefix + "report-view.json"]]);
    mock.owner = false;
    expect((await readPrivateReport({ id, reportId })).status).toBe(404);
    expect(mock.download).toHaveBeenCalledTimes(1);
    mock.owner = true;
    mock.download.mockResolvedValueOnce(Buffer.from(JSON.stringify({ ...view, schema: "meow_report_view/2" })));
    const fallback = await readPrivateReport({ id, reportId });
    expect(await fallback.text()).toContain("歷史完整報告");
  } finally {
    vi.unstubAllEnvs();
  }
});
