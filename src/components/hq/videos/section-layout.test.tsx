// 段落影片與片段並排（#601）：同一段的段落影片放左欄、片段放右欄；寬窄螢幕的排法由 CSS 決定
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/hq/HqToast", () => ({ useHqToast: () => () => {} }));
vi.mock("@/components/hq/HqActor", () => ({ useHqActor: () => ({ preview: false }) }));
import { SectionBody } from "./ClipsBoard";

afterEach(cleanup);

describe("SectionBody", () => {
  it("段落影片在左欄、片段在右欄，兩欄放在同一個並排容器", () => {
    const { container } = render(<SectionBody video={<p>段落影片內容</p>}><p>片段內容</p></SectionBody>);
    const body = container.querySelector(".hq-video-secbody");
    expect(body).not.toBeNull();
    const cols = Array.from(body!.children);
    expect(cols).toHaveLength(2);
    expect(cols[0]).toHaveClass("hq-video-section");
    expect(cols[0]).toContainElement(screen.getByText("段落影片內容"));
    expect(cols[1]).toHaveClass("hq-video-secclips");
    expect(cols[1]).toContainElement(screen.getByText("片段內容"));
  });
});
