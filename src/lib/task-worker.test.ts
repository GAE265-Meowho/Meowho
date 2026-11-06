import { describe, expect, it, vi } from "vitest";
import { prepareTasks, requestWorker, type RpcClient } from "./task-worker";

const req = { catId: "c1", memberId: "u1", roomId: "r1" };
const client = (data: unknown, error: { message: string } | null = null) => {
  const rpc = vi.fn(async () => ({ data, error }));
  return { sb: { rpc } as RpcClient, rpc };
};

describe("領養人按下才產生任務（0030）", () => {
  it("任務 worker 還沒接上：一律改用系統預設任務", async () => {
    expect(await requestWorker(req)).toBeNull();
    const { sb, rpc } = client("v1");
    expect(await prepareTasks(sb, req)).toEqual({ ok: true, versionId: "v1", source: "default" });
    expect(rpc).toHaveBeenCalledWith("meow_prepare_cat_tasks", { p_cat_id: "c1" });
  });
  it("worker 產生成功：用 worker 的版本，不再呼叫預設任務", async () => {
    const { sb, rpc } = client("v1");
    const worker = vi.fn(async () => "w1");
    expect(await prepareTasks(sb, req, worker)).toEqual({ ok: true, versionId: "w1", source: "worker" });
    expect(worker).toHaveBeenCalledWith(req);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("worker 失敗：退回系統預設任務，遊戲不會卡住", async () => {
    const { sb } = client("v1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await prepareTasks(sb, req, async () => { throw new Error("timeout"); })).toEqual({ ok: true, versionId: "v1", source: "default" });
  });
  it("資料庫擋下時回傳錯誤代碼", async () => {
    expect(await prepareTasks(client(null, { message: "run_cat_not_ready" }).sb, req)).toEqual({ ok: false, code: "run_cat_not_ready" });
    expect(await prepareTasks(client(null, { message: "boom" }).sb, req)).toEqual({ ok: false, code: "prepare_failed" });
  });
});
