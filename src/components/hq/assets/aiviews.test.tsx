// 製作glb工作區的 AI 三視角照片（#110）
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listBundledCats } from "@/lib/hq/cat-models/bundled";
import type { CatModelView } from "@/lib/hq/cat-models/types";
import { AiViews } from "./AiViews";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const base = listBundledCats()[1];
const cat = (over: Partial<CatModelView>): CatModelView => ({ ...base, id: "cat_20261102_010000", aiViews: [], aiRunning: [], aiErrors: {}, updatedAt: "v1", ...over });
const ok = () => { const f = vi.fn(async () => ({ ok: true, status: 202, json: async () => ({ ok: true }) })); vi.stubGlobal("fetch", f); return f; };

describe("AiViews（#110）", () => {
  it("原始照片＋三張 AI 照片；已產生的顯示圖片與「重新產生」", () => {
    render(<AiViews cat={cat({ aiViews: ["left", "front", "back"] })} onStarted={() => {}} />);
    const group = screen.getByRole("group", { name: "照片" });
    expect(within(group).getByAltText(/原始照片/)).toBeInTheDocument();
    expect(within(group).getByAltText("AI 左側面照片")).toHaveAttribute("src", "/api/hq/cat-models/cat_20261102_010000/file/gen_left?t=v1");
    expect(within(group).getByText("AI 左側面（用來上色）")).toBeInTheDocument();
    expect(within(group).getAllByRole("button", { name: "重新產生" })).toHaveLength(3);
  });
  it("產生中：顯示「產生中…」、按鈕停用", () => {
    render(<AiViews cat={cat({ aiRunning: ["left", "front", "back"] })} onStarted={() => {}} />);
    expect(screen.getAllByText("產生中…")).toHaveLength(3);
    for (const b of screen.getAllByRole("button", { name: "產生" })) expect(b).toBeDisabled();
  });
  it("失敗：顯示原因；單張重新產生只送那個角度", async () => {
    const f = ok();
    const started = vi.fn();
    render(<AiViews cat={cat({ aiViews: ["left", "front"], aiErrors: { back: "AI 影像服務忙碌中，請稍後重新產生" } })} onStarted={started} />);
    expect(screen.getByText("AI 影像服務忙碌中，請稍後重新產生")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "產生" }));
    await waitFor(() => expect(started).toHaveBeenCalled());
    expect(f).toHaveBeenCalledWith("/api/hq/cat-models/cat_20261102_010000/views", expect.objectContaining({ body: JSON.stringify({ views: ["back"] }) }));
  });
  it("三張都沒產生過：顯示「產生 AI 三視角」，送出三個角度", async () => {
    const f = ok();
    render(<AiViews cat={cat({})} onStarted={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "產生 AI 三視角" }));
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/hq/cat-models/cat_20261102_010000/views", expect.objectContaining({ body: JSON.stringify({ views: ["left", "front", "back"] }) })));
  });
  it("未設定影像模型：顯示白話原因", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: "ai_disabled" }) })));
    render(<AiViews cat={cat({})} onStarted={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "產生 AI 三視角" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("尚未設定 AI 影像模型");
  });
});
