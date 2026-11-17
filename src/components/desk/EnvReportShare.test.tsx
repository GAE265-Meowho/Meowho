import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 假的 Supabase：from(表) 回傳可串接、可 await 的查詢，資料依表名給
let tables: Record<string, unknown[]> = {};
const rpc = vi.fn(async () => ({ error: null as { message: string } | null }));
function query(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order"]) q[m] = () => q;
  q.then = (ok: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data: tables[table] ?? [] }).then(ok);
  return q;
}
vi.mock("@/lib/supabase/client", () => ({ getBrowserSupabase: () => ({ from: query, rpc }) }));
vi.mock("@/app/homes/[id]/safety/SafetyReportDetails", () => ({
  SafetyReportDetails: ({ householdId, reportId }: { householdId: string; reportId: string }) => <p>報告內容 {householdId}/{reportId}</p>,
}));

const { EnvReportShare } = await import("./EnvReportShare");

const report = (id: string, created_at: string, room: string | null = null) =>
  ({ id, household_id: "home-1", status: "ready", room_model_id: room, created_at, items: [] });

beforeEach(() => { tables = {}; rpc.mockClear(); });
afterEach(cleanup);

describe("EnvReportShare 私訊的居家安全報告", () => {
  it("領養人：預設分享最新一份，按下後呼叫 meow_share_env_report", async () => {
    tables = {
      meow_households: [{ id: "home-1" }],
      meow_env_reports: [report("r-new", "2026-11-16T02:00:00Z", "room-1"), report("r-old", "2026-11-10T02:00:00Z")],
    };
    const onShared = vi.fn();
    render(<EnvReportShare threadId="t-1" userId="u-1" isKeeper={false} refresh={0} onShared={onShared} onError={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "分享居家安全報告" }));
    await waitFor(() => expect(onShared).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("meow_share_env_report", { p_report_id: "r-new", p_thread_id: "t-1" });
  });

  it("領養人：選到已分享的那份，按鈕顯示已分享且不能按", async () => {
    tables = {
      meow_households: [{ id: "home-1" }],
      meow_env_report_shares: [{ report_id: "r-new", shared_at: "2026-11-16T03:00:00Z" }],
      meow_env_reports: [report("r-new", "2026-11-16T02:00:00Z")],
    };
    render(<EnvReportShare threadId="t-1" userId="u-1" isKeeper={false} refresh={0} onShared={vi.fn()} onError={vi.fn()} />);
    const done = await screen.findByRole("button", { name: "已分享這份報告" });
    expect((done as HTMLButtonElement).disabled).toBe(true);
  });

  it("領養人沒有產生好的報告就不顯示", async () => {
    tables = { meow_households: [{ id: "home-1" }] };
    const { container } = render(<EnvReportShare threadId="t-1" userId="u-1" isKeeper={false} refresh={0} onShared={vi.fn()} onError={vi.fn()} />);
    await new Promise(r => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
  });

  it("中途：看得到領養人分享的報告，展開讀報告 API；沒有分享按鈕", async () => {
    tables = {
      meow_env_report_shares: [{ report_id: "r-new", shared_at: "2026-11-16T03:00:00Z" }],
      meow_env_reports: [report("r-new", "2026-11-16T02:00:00Z")],
    };
    render(<EnvReportShare threadId="t-1" userId="keeper" isKeeper refresh={0} onShared={vi.fn()} onError={vi.fn()} />);
    const toggle = await screen.findByRole("button", { name: /居家安全報告/ });
    expect(screen.queryByRole("button", { name: "分享居家安全報告" })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText("報告內容 home-1/r-new")).toBeTruthy();
  });

  it("中途：還沒有分享就不顯示", async () => {
    const { container } = render(<EnvReportShare threadId="t-1" userId="keeper" isKeeper refresh={0} onShared={vi.fn()} onError={vi.fn()} />);
    await new Promise(r => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
  });
});
