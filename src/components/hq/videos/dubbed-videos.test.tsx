// 無聲剪輯版與已配音版合成一張卡（#599）：切換鈕選版本，預設已配音版；完整影片下面接字幕檔
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/hq/HqToast", () => ({ useHqToast: () => () => {} }));
vi.mock("@/components/hq/HqActor", () => ({ useHqActor: () => ({ preview: false }) }));
import { DualVideo } from "./ClipsBoard";
import type { TrailerVideosState } from "./TrailerVideos";

afterEach(cleanup);

const state = (videos: TrailerVideosState["videos"]) => ({ videos, status: "ready", reload: async () => {} }) as unknown as TrailerVideosState;
const ver = (slot: string, ext = "mp4") => [{ path: `videos/trailer/${slot}/20261121090000.${ext}`, at: "2026-11-21T09:00:00Z", url: `https://blob/${slot}.${ext}`, downloadUrl: `https://blob/${slot}.${ext}?dl` }];

describe("DualVideo", () => {
  it("有已配音版時預設播已配音版，可切到無聲剪輯版；完整影片下面有字幕格", () => {
    render(<DualVideo of="full" videos={state({ full: ver("full"), "dub-full": ver("dub-full"), "sub-full": ver("sub-full", "srt") })} emptyText="前導影片還沒上傳" />);
    const card = screen.getByRole("group", { name: "前導影片的版本" });
    expect(within(card).getByRole("button", { name: "已配音版" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "播放：前導影片（已配音）" })).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "無聲剪輯版" }));
    expect(screen.getByRole("button", { name: "播放：前導影片" })).toBeInTheDocument();
    expect(screen.getByText("看字幕內容")).toBeInTheDocument();
  });

  it("還沒有已配音版時預設無聲剪輯版；段落沒有字幕格", () => {
    render(<DualVideo of="ending" videos={state({ ending: ver("ending") })} emptyText="這一段剪好後上傳" />);
    expect(screen.getByRole("button", { name: "無聲剪輯版" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/字幕檔/)).not.toBeInTheDocument();
  });
});
