// AI 三視角照片卡片（#110 Stitch）：新增貓咪步驟 02 與製作glb工作區共用
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listBundledCats } from "@/lib/hq/cat-models/bundled";
import type { CatModelView } from "@/lib/hq/cat-models/types";
import { AiViews, estPerImageUsd } from "./AiViews";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const base = listBundledCats()[1];
const cat = (over: Partial<CatModelView>): CatModelView => ({ ...base, id: "cat_20261102_010000", aiViews: [], aiRunning: [], aiErrors: {}, aiAge: null, aiPrompts: {}, aiUsage: {}, aiQuality: null, updatedAt: "v1", ...over });
const ok = () => { const f = vi.fn(async () => ({ ok: true, status: 202, json: async () => ({ ok: true }) })); vi.stubGlobal("fetch", f); return f; };
const bodyOf = (f: ReturnType<typeof vi.fn>) => JSON.parse(String((f.mock.calls[0] as unknown as [string, { body: string }])[1].body));

describe("AiViews（#110）", () => {
  it("原始＋三張 AI 照片；完成的顯示圖片、狀態與「重新產生」；左側面標「用來上色」", () => {
    render(<AiViews cat={cat({ aiViews: ["left", "front", "back"] })} onStarted={() => {}} />);
    const group = screen.getByRole("group", { name: "AI 三視角" });
    expect(screen.getByRole("group", { name: "上傳的照片" })).toHaveTextContent("原始");
    expect(within(group).getByAltText("AI 左側面照片")).toHaveAttribute("src", "/api/hq/cat-models/cat_20261102_010000/file/gen_left?t=v1");
    expect(within(group).getByText("用來上色")).toBeInTheDocument();
    expect(within(group).getAllByText("完成")).toHaveLength(3);
    expect(within(group).getAllByRole("button", { name: "重新產生" })).toHaveLength(3);
  });
  it("產生中：顯示「產生中」與預估時間，沒有重新產生按鈕", () => {
    render(<AiViews cat={cat({ aiRunning: ["left", "front", "back"] })} onStarted={() => {}} />);
    expect(screen.getAllByText("約 20～60 秒")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "重新產生" })).toBeNull();
  });
  it("失敗：顯示原因；單張重新產生只送那個角度並帶畫質", async () => {
    const f = ok();
    const started = vi.fn();
    render(<AiViews cat={cat({ aiViews: ["left", "front"], aiErrors: { back: "AI 影像服務忙碌中，請稍後重新產生" } })} onStarted={started} />);
    expect(screen.getByText("AI 影像服務忙碌中，請稍後重新產生")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("figure", { name: "AI 背部照片" })).getByRole("button", { name: "重新產生" }));
    await waitFor(() => expect(started).toHaveBeenCalled());
    expect(bodyOf(f)).toEqual({ views: ["back"], quality: "low", size: "1024x1024" });
  });
  it("指示可切換中｜EN；顯示實際送出的指示（含幼貓）", () => {
    const prompts = { left: { en: "This is a kitten. LEFT", zh: "這是幼貓。朝左" } };
    render(<AiViews cat={cat({ aiViews: ["left"], aiPrompts: prompts })} onStarted={() => {}} />);
    const card = screen.getByRole("figure", { name: "AI 左側面照片" });
    expect(within(card).getByText("這是幼貓。朝左")).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "EN" }));
    expect(within(card).getByText("This is a kitten. LEFT")).toBeInTheDocument();
  });
  it("年齡判斷列與「不是貓」警告", () => {
    render(<AiViews cat={cat({ aiAge: { months: 3, isCat: false, coat: "虎斑", breed: null, confidence: 0.8, source: "ai" } })} onStarted={() => {}} />);
    expect(screen.getByText("幼貓・約 3 個月")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("模型認為這不是貓");
  });
  it("用量與費用：每張 token、估計費用與合計", () => {
    const usage = { left: { input: 1288, output: 196, textIn: 300, imageIn: 988 } };
    render(<AiViews cat={cat({ aiViews: ["left"], aiUsage: usage, aiQuality: "low" })} onStarted={() => {}} />);
    // 300×5 + 988×8 + 196×30 = 15284 → US$0.0153
    expect(screen.getAllByText("US$0.0153").length).toBeGreaterThan(0);
    expect(estPerImageUsd("low")).toBeCloseTo(0.01628, 4);
  });
  it("三張都沒產生過：「產生 AI 三視角」送出三個角度；未設定影像模型顯示白話原因", async () => {
    const f = ok();
    const { unmount } = render(<AiViews cat={cat({})} onStarted={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "產生 AI 三視角" }));
    await waitFor(() => expect(bodyOf(f).views).toEqual(["left", "front", "back"]));
    unmount();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: "ai_disabled" }) })));
    render(<AiViews cat={cat({})} onStarted={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "產生 AI 三視角" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("尚未設定 AI 影像模型");
  });
  it("#118 分「上傳的照片」與「AI 三視角」；顯示其他角度照片 2、3，沒上傳時寫明", () => {
    const { unmount } = render(<AiViews cat={cat({ extraPhotos: ["front", "back"] })} onStarted={() => {}} />);
    const up = screen.getByRole("group", { name: "上傳的照片" });
    expect(within(up).getByAltText("其他角度照片 2")).toHaveAttribute("src", "/api/hq/cat-models/cat_20261102_010000/file/photo_front");
    expect(within(up).getByAltText("其他角度照片 3")).toHaveAttribute("src", "/api/hq/cat-models/cat_20261102_010000/file/photo_back");
    expect(screen.getByRole("group", { name: "AI 三視角" })).toBeInTheDocument();
    unmount();
    render(<AiViews cat={cat({ extraPhotos: [] })} onStarted={() => {}} />);
    expect(screen.getByText("沒有上傳其他角度照片。")).toBeInTheDocument();
  });
});
