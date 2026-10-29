// MeowHQ 鈴鐺（Issue #23）：最近 10 則自己的通知、標為已讀
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const calls: { op: string; args: unknown[] }[] = [];
const rows = [
  { id: "n1", title: "中途認證已通過", body: null, link: "/me", read_at: null, created_at: "2026-10-29T01:00:00Z" },
  { id: "n2", title: "舊通知", body: "內容", link: null, read_at: "2026-10-28T01:00:00Z", created_at: "2026-10-28T01:00:00Z" },
];
function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const op of ["select", "eq", "order", "in", "is", "update"]) c[op] = (...args: unknown[]) => { calls.push({ op, args }); return c; };
  c.limit = (...args: unknown[]) => { calls.push({ op: "limit", args }); return Promise.resolve(result); };
  c.then = (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res);
  return c;
}
vi.mock("@/lib/supabase/client", () => ({ getBrowserSupabase: () => ({ from: () => chain({ data: rows, error: null }) }) }));

import { NotificationBell } from "./NotificationBell";

afterEach(() => { cleanup(); calls.length = 0; });

describe("NotificationBell", () => {
  it("點開讀取自己最近 10 則通知", async () => {
    render(<NotificationBell unread={1} userId="u1" />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /通知.*1/ })); });
    expect(screen.getByRole("dialog", { name: "通知" })).toHaveTextContent("中途認證已通過");
    expect(calls).toContainEqual({ op: "eq", args: ["user_id", "u1"] });
    expect(calls).toContainEqual({ op: "limit", args: [10] });
  });
  it("標為已讀會更新 read_at 並通知外殼重算未讀", async () => {
    const changed = vi.fn();
    render(<NotificationBell unread={1} userId="u1" onChanged={changed} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /通知/ })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "標為已讀" })); });
    expect(calls.find(c => c.op === "update")?.args[0]).toHaveProperty("read_at");
    expect(calls).toContainEqual({ op: "in", args: ["id", ["n1"]] });
    expect(changed).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "標為已讀" })).toBeNull();
  });
});
