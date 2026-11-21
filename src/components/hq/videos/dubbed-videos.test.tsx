// 已配音的影片區塊：完整影片下方，完整影片兩支＋四段各一格，已上傳的格顯示播放鈕
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/hq/HqToast", () => ({ useHqToast: () => () => {} }));
vi.mock("@/components/hq/HqActor", () => ({ useHqActor: () => ({ preview: false }) }));
import { DubbedVideos } from "./ClipsBoard";
import type { TrailerVideosState } from "./TrailerVideos";

afterEach(cleanup);

const state = (videos: TrailerVideosState["videos"]) => ({ videos, status: "ready", reload: async () => {} }) as unknown as TrailerVideosState;

describe("DubbedVideos", () => {
  it("六格：前導影片、系統 Demo 影片、四段；已上傳的格可以播放", () => {
    render(<DubbedVideos videos={state({
      "dub-full": [{ path: "videos/trailer/dub-full/20261120090000.mp4", at: "2026-11-20T09:00:00Z", url: "https://blob/a.mp4", downloadUrl: "https://blob/a.mp4?dl" }],
    })} />);
    const sec = screen.getByRole("region", { name: /已配音的影片/ });
    expect(within(sec).getByRole("heading", { level: 2 })).toHaveTextContent("已配音的影片（1／6）");
    for (const h of ["前導影片", "系統 Demo 影片", "第一段遺棄開場", "第二段交叉敘事", "第三段匯聚與產品登場", "第四段相遇結尾"]) {
      expect(within(sec).getByRole("heading", { level: 3, name: new RegExp(`^${h}`) })).toBeInTheDocument();
    }
    expect(within(sec).getByRole("button", { name: "播放：前導影片（已配音）" })).toBeInTheDocument();
    expect(within(sec).getAllByText("配好音後上傳")).toHaveLength(5);
  });

  it("兩支完整影片下面各一格字幕檔（#586、#592），已上傳的可展開看內容", () => {
    render(<DubbedVideos videos={state({
      "sub-demo": [{ path: "videos/trailer/sub-demo/20261121114000.srt", at: "2026-11-21T11:40:00Z", url: "https://blob/s.srt", downloadUrl: "https://blob/s.srt?dl" }],
    })} />);
    const sec = screen.getByRole("region", { name: /已配音的影片/ });
    expect(within(sec).getAllByText("字幕檔（.srt／.vtt）")).toHaveLength(2);
    expect(within(sec).getAllByText("還沒有字幕檔")).toHaveLength(1);
    expect(within(sec).getByText("看字幕內容")).toBeInTheDocument();
    expect(within(sec).getAllByRole("button", { name: "上傳字幕檔" })).toHaveLength(1);
  });
});
