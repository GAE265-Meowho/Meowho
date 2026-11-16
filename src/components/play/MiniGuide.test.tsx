import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MiniGuideGate } from "./MiniGuide";
import { guideKey } from "@/lib/play/mini-guide";

describe("小遊戲開始前的示範", () => {
  beforeEach(() => { window.localStorage.clear(); });
  afterEach(cleanup);

  it("先顯示示範，按「開始」才進遊戲", () => {
    render(<MiniGuideGate id="feed" catName="灰寶"><p>遊戲本體</p></MiniGuideGate>);
    expect(screen.getByText("餵飯怎麼玩")).toBeInTheDocument();
    expect(screen.queryByText("遊戲本體")).toBeNull();
    // 有真正遊戲畫面的錄影：放影片，全部步驟一起列出來
    expect(screen.getByLabelText("餵飯的遊戲畫面示範").getAttribute("src")).toBe("/play/guide/feed.mp4");
    expect(screen.getByText("按住倒，到建議份量放開")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    expect(screen.getByText("遊戲本體")).toBeInTheDocument();
    expect(window.localStorage.getItem(guideKey("feed"))).toBeNull();
  });

  it("勾「下次不再顯示」之後直接進遊戲", () => {
    const { unmount } = render(<MiniGuideGate id="pet" catName="灰寶"><p>遊戲本體</p></MiniGuideGate>);
    expect(screen.getByText("在牠身上慢慢拖曳")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("下次不再顯示"));
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    unmount();
    render(<MiniGuideGate id="pet" catName="灰寶"><p>遊戲本體</p></MiniGuideGate>);
    expect(screen.getByText("遊戲本體")).toBeInTheDocument();
  });

  it("沒有錄影的（逗貓）用動畫示範圖，可以點圓點換步驟", () => {
    render(<MiniGuideGate id="play" catName="灰寶"><p>遊戲本體</p></MiniGuideGate>);
    expect(screen.queryByLabelText("逗貓的遊戲畫面示範")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "第 2 步" }));
    expect(screen.getByText("灰寶碰到才算抓到")).toBeInTheDocument();
  });
});
