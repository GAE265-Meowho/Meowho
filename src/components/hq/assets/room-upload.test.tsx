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
    render(<RoomUpload />);
    expect(screen.getByRole("button", { name: "開始轉換" })).toBeDisabled();
  });

  it("選到不支援的格式顯示錯誤", () => {
    render(<RoomUpload />);
    choose("image/png", 100);
    expect(screen.getByRole("alert")).toHaveTextContent("請選 MP4 或 MOV 影片");
    expect(screen.getByRole("button", { name: "開始轉換" })).toBeDisabled();
  });

  it("超過大小上限顯示錯誤", () => {
    render(<RoomUpload />);
    choose("video/mp4", 60 * 1024 * 1024);
    expect(screen.getByRole("alert")).toHaveTextContent("影片不能超過 50 MB");
  });

  it("合格影片可以開始", () => {
    render(<RoomUpload />);
    choose("video/mp4", 1024);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "開始轉換" })).toBeEnabled();
  });
});
