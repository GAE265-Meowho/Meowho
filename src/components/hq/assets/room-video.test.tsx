// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomView } from "@/lib/hq/rooms/types";

vi.mock("next/dynamic", () => ({ default: () => ({ base }: { base: string }) => <div data-testid="viewer">{base}</div> }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: true }));

const { RoomVideoTab } = await import("./RoomVideoTab");

const NOW = Date.parse("2026-11-03T06:10:00Z");
const base: RoomView = {
  id: "room_20261103_140000", name: "客廳", status: "running", step: "訓練 splat (brush)", error: null,
  createdAt: "2026-11-03T06:00:00Z", startedAt: "2026-11-03T06:04:00Z", finishedAt: null, resultBase: null,
  createdBy: "珮瑜", note: "沙發有拍到", thumbUrl: null,
};
const rooms: RoomView[] = [
  base,
  { ...base, id: "room_20261103_110000", name: "子哲房間", status: "ready", step: null, startedAt: "2026-11-03T03:20:17Z",
    finishedAt: "2026-11-03T03:35:26Z", resultBase: "https://x/results/a", thumbUrl: "https://x/results/a/thumb.jpg", note: null },
];

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ rooms }))));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const renderTab = (q?: string) => {
  const update = vi.fn();
  render(<RoomVideoTab query={{ page: 1, q }} update={update} />);
  return update;
};

describe("RoomVideoTab（#93 總覽與進度）", () => {
  it("列表欄位同貓咪列表，處理中顯示第幾步", async () => {
    renderTab();
    expect(await screen.findByText("4/6 訓練 3D 畫面・轉換中")).toBeInTheDocument();
    for (const h of ["縮圖", "名稱", "進度", "建立者", "更新時間", "備註說明"]) expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
    expect(screen.getByText("沙發有拍到")).toBeInTheDocument();
  });

  it("沒選房間時自動顯示處理中那間的任務進度", async () => {
    renderTab();
    expect(await screen.findByRole("region", { name: "任務進度" })).toHaveTextContent("第 4 步／共 6 步：訓練 3D 畫面");
    expect(screen.getByRole("status")).toHaveTextContent("已經過 6 分鐘，整體約需 20 分鐘。這一步最久");
  });

  it("點完成的房間進 3D 檢視並顯示耗時", async () => {
    renderTab();
    fireEvent.click(await screen.findByText("子哲房間"));
    expect(screen.getByTestId("viewer")).toHaveTextContent("https://x/results/a");
    expect(screen.getByText(/轉換耗時 15 分 9 秒/)).toBeInTheDocument();
  });

  it("搜尋只留符合的房間", async () => {
    renderTab("子哲");
    expect(await screen.findByText("子哲房間")).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "客廳" })).toBeNull();
  });

  it("排隊超過 2 分鐘提醒 worker 可能沒開", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ rooms: [{ ...base, status: "queued", step: null, startedAt: null }] }))));
    renderTab();
    expect(await screen.findByRole("alert")).toHaveTextContent("room_worker");
    expect(screen.getAllByText("排隊逾時").length).toBeGreaterThan(0);
  });
});
