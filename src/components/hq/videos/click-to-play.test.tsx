// 前導影片的影片不預先載入（#532）：進頁面只有播放鈕，按下才放 <video> 並開始播放
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ClickToPlay } from "./TrailerVideos";

afterEach(cleanup);

describe("ClickToPlay", () => {
  it("一開始沒有 <video>，不會下載影片", () => {
    const { container } = render(<ClickToPlay src="https://blob/x.mp4" label="鏡 2" />);
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByRole("button", { name: "播放：鏡 2" })).toBeInTheDocument();
  });

  it("按下播放才載入並自動開始播放", () => {
    const { container } = render(<ClickToPlay src="https://blob/x.mp4" label="鏡 2" />);
    fireEvent.click(screen.getByRole("button", { name: "播放：鏡 2" }));
    const v = container.querySelector("video")!;
    expect(v).toHaveAttribute("src", "https://blob/x.mp4");
    expect(v.autoplay).toBe(true);
    expect(v).toHaveAttribute("controls");
  });
});
