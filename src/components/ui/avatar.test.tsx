// 頭像：Google 大頭貼網址載入失敗（403／429）時改顯示替代內容，不留空白圓圈
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AvatarImage from "./AvatarImage";

afterEach(cleanup);

describe("AvatarImage", () => {
  it("有網址時顯示圖片，且不送出 Referer", () => {
    const { container } = render(<AvatarImage src="https://lh3.googleusercontent.com/a/x" fallback={<span>T</span>} />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/x");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("圖片載入失敗時改顯示替代內容", () => {
    const { container } = render(<AvatarImage src="https://lh3.googleusercontent.com/a/x" fallback={<span>T</span>} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  it("沒有網址時直接顯示替代內容", () => {
    render(<AvatarImage src={null} fallback={<span>T</span>} />);
    expect(screen.getByText("T")).toBeInTheDocument();
  });
});
