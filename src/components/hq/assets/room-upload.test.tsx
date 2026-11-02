// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomUpload } from "./RoomUpload";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ rooms: [] }))));
});

afterEach(cleanup);

const choose = (type: string, size: number) => {
  const file = new File(["x"], "room", { type });
  Object.defineProperty(file, "size", { value: size });
  fireEvent.change(screen.getByLabelText(/房間影片/), { target: { files: [file] } });
};

describe("RoomUpload（#93）", () => {
  it("沒選影片不能開始", () => {
    render(<RoomUpload onView={() => {}} />);
    expect(screen.getByRole("button", { name: "開始轉換" })).toBeDisabled();
  });

  it("選到不支援的格式顯示錯誤", () => {
    render(<RoomUpload onView={() => {}} />);
    choose("image/png", 100);
    expect(screen.getByRole("alert")).toHaveTextContent("請選 MP4 或 MOV 影片");
    expect(screen.getByRole("button", { name: "開始轉換" })).toBeDisabled();
  });

  it("超過大小上限顯示錯誤", () => {
    render(<RoomUpload onView={() => {}} />);
    choose("video/mp4", 60 * 1024 * 1024);
    expect(screen.getByRole("alert")).toHaveTextContent("影片不能超過 50 MB");
  });

  it("完成的房間可以查看，處理中的不行", async () => {
    const room = { id: "room_20261102_090000", name: "客廳", step: null, error: null, createdAt: "2026-11-02T01:00:00Z" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ rooms: [
      { ...room, status: "ready", resultBase: "https://x/results/a" },
      { ...room, id: "room_20261102_090001", name: "書房", status: "running", resultBase: null },
    ] }))));
    const onView = vi.fn();
    render(<RoomUpload onView={onView} />);
    fireEvent.click(await screen.findByRole("button", { name: "查看房間" }));
    expect(onView).toHaveBeenCalledWith("https://x/results/a");
    expect(screen.getAllByRole("button", { name: "查看房間" })).toHaveLength(1);
  });

  it("合格影片可以開始", () => {
    render(<RoomUpload onView={() => {}} />);
    choose("video/mp4", 1024);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "開始轉換" })).toBeEnabled();
  });
});
