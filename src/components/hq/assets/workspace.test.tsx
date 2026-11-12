// 3D 編輯器工作區（#96）：左側預覽固定、右側參數面板分組摺疊；調整與展開收合都不能讓預覽重新初始化。
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatModelView } from "@/lib/hq/cat-models/types";
import { HqToastProvider } from "../HqToast";
import { BaseLab } from "./BaseLab";
import { CatPage } from "./CatPage";

// 3D 預覽換成計數用的替身：記錄掛載次數與最新參數
const preview = vi.hoisted(() => ({ mounts: 0, last: {} as Record<string, unknown> }));
vi.mock("./CatPreview", () => ({
  default: function FakePreview(props: Record<string, unknown>) {
    useEffect(() => { preview.mounts += 1; }, []);
    preview.last = props;
    return <div data-testid="fake-preview" />;
  },
}));
const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../HqStates", async orig => ({ ...(await orig<typeof import("../HqStates")>()), useOnline: () => true }));

const current = vi.hoisted(() => ({ over: {} as Record<string, unknown> }));
const cat: CatModelView = {
  id: "cat_20261031_100000", name: "小橘", ownerType: "template", status: "ready", ageMonths: null, weightKg: null, notes: "",
  photoView: "front", fillPattern: "none", hasAlbedo: true, hasPrevAlbedo: false, albedoVersion: null, body: "adult", jobStatus: null, jobQueuedAt: null, jobStartedAt: null, jobSeconds: null, jobStep: null, jobError: null,
  createdAt: "2026-10-31T10:00:00", updatedAt: "2026-10-31T10:00:00", createdBy: null, extraPhotos: [], aiViews: [], aiRunning: [], aiErrors: {}, aiAge: null, aiPrompts: {}, aiUsage: {}, aiQuality: null,
};
vi.mock("./useCatModels", async orig => ({
  ...(await orig<typeof import("./useCatModels")>()),
  useCat: () => ({ value: { state: "ready", data: { ...cat, ...current.over } }, reload: vi.fn() }),
}));

beforeEach(() => { preview.mounts = 0; preview.last = {}; current.over = {}; nav.replace.mockReset(); });
afterEach(() => cleanup());

const groupTitles = (panel: HTMLElement) =>
  Array.from(panel.querySelectorAll(":scope > details > summary")).map(s => s.textContent);

describe("骨架測試台工作區（#96）", () => {
  it("預覽在左欄，所有參數在右側面板，依功能分組", async () => {
    render(<BaseLab body="adult" />);
    await screen.findByTestId("fake-preview");
    const stage = screen.getByRole("region", { name: "3D 預覽" });
    const panel = screen.getByRole("region", { name: "參數" });
    expect(within(stage).getByTestId("lab-canvas-adult")).toBeInTheDocument();
    expect(groupTitles(panel)).toEqual(["播放與畫面", "動作", "眼睛", "貓咪資訊"]);
    // 原本在預覽上方的控制項移到面板，參數一個都不少
    for (const name of [/眨眼/, /環境亮度/, /瞳孔寬窄/, /虹膜大小/, /角膜凸起/, /角膜折射率/]) {
      expect(within(panel).getByRole("slider", { name })).toBeInTheDocument();
    }
    expect(within(panel).getByRole("button", { name: "重設視角" })).toBeInTheDocument();
    expect(within(panel).getByRole("checkbox", { name: /眼睛看游標/ })).toBeInTheDocument();
    expect(within(stage).queryByRole("slider")).toBeNull();
  });

  it("收合、展開群組與調整參數都不會重新初始化預覽，數值即時傳給預覽", async () => {
    render(<BaseLab body="adult" />);
    await screen.findByTestId("fake-preview");
    const panel = screen.getByRole("region", { name: "參數" });
    const eyes = Array.from(panel.querySelectorAll<HTMLDetailsElement>(":scope > details")).find(d => d.querySelector("summary")?.textContent === "眼睛")!;
    expect(eyes.open).toBe(true);
    act(() => { eyes.open = false; eyes.dispatchEvent(new Event("toggle")); });
    act(() => { eyes.open = true; eyes.dispatchEvent(new Event("toggle")); });
    fireEvent.change(within(panel).getByRole("slider", { name: /眨眼/ }), { target: { value: "0.6" } });
    expect(preview.last.blink).toBe(0.6);
    // 收合後的參數值保留
    expect(within(panel).getByRole("slider", { name: /眨眼/ })).toHaveValue("0.6");
    expect(preview.mounts).toBe(1);
  });
});

describe("貓咪頁工作區（#96）", () => {
  it("#104 切換到未製作的幼貓時顯示製作入口，不載入示範貓", async () => {
    current.over = { variantStorage: true, bodyVariants: { adult: {
      albedoUrl: "https://example.test/adult.png", prevUrl: null,
      texture: { state: "confirmed", preview: "albedo", previewBody: "adult" }, baseVersion: "adult-v1",
    } } };
    render(<HqToastProvider><CatPage id={cat.id} /></HqToastProvider>);
    await screen.findByTestId("fake-preview");
    expect(preview.last.albedoUrl).toBe("https://example.test/adult.png");
    fireEvent.click(screen.getByRole("button", { name: "幼貓" }));
    expect(screen.queryByTestId("fake-preview")).toBeNull();
    expect(screen.getByRole("link", { name: "前往製作幼貓貼圖" })).toHaveAttribute("href", `/MeowHQ/assets/cats/${cat.id}/studio?body=kitten`);
  });
  it("#289 切換成貓／幼貓時，預覽下方的貓咪紋理跟著換", async () => {
    const tex = (body: "adult" | "kitten") => ({
      albedoUrl: `https://example.test/${body}.png`, prevUrl: null,
      texture: { state: "confirmed", preview: "albedo", previewBody: body }, baseVersion: `${body}-v1`,
    });
    current.over = { variantStorage: true, bodyVariants: { adult: tex("adult"), kitten: tex("kitten") } };
    render(<HqToastProvider><CatPage id={cat.id} /></HqToastProvider>);
    await screen.findByTestId("fake-preview");
    const stage = screen.getByRole("region", { name: "3D 預覽" });
    expect(within(stage).getByAltText("成貓紋理貼圖")).toHaveAttribute("src", "https://example.test/adult.png");
    fireEvent.click(screen.getByRole("button", { name: "幼貓" }));
    expect(within(stage).getByAltText("幼貓紋理貼圖")).toHaveAttribute("src", "https://example.test/kitten.png");
    expect(within(stage).queryByAltText("成貓紋理貼圖")).toBeNull();
  });
  it("#129 三欄：原貓咪資訊｜3D 預覽｜播放與畫面、動作", async () => {
    render(<HqToastProvider><CatPage id={cat.id} /></HqToastProvider>);
    await screen.findByTestId("fake-preview");
    const stage = screen.getByRole("region", { name: "3D 預覽" });
    const panel = screen.getByRole("region", { name: "參數" });
    expect(within(stage).getByTestId("cat-canvas")).toBeInTheDocument();
    expect(groupTitles(panel)).toEqual(["播放與畫面", "動作"]);
    const info = screen.getByRole("region", { name: "原貓咪資訊" });
    expect(groupTitles(info)).toEqual(["原貓咪資訊", "AI 三視角"]); // 已產生的三視角放在原貓咪資訊下方
    // #289：貓咪紋理移到中間欄、3D 預覽下方；預覽外框是正方形
    expect(groupTitles(stage)).toEqual(["貓咪紋理"]);
    const canvas = within(stage).getByTestId("cat-canvas");
    const texture = within(stage).getByAltText("成貓紋理貼圖");
    expect(canvas.compareDocumentPosition(texture) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(stage).toHaveClass("hq-catstage-square");
    // DOM 順序＝桌面欄位順序：資訊、預覽、參數
    const order = [info, stage, panel];
    expect(order.every((el, i) => i === 0 || (order[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    for (const name of [/眨眼/, /瞳孔寬窄/, /環境亮度/]) {
      expect(within(panel).getByRole("slider", { name })).toBeInTheDocument();
    }
    expect(within(stage).queryByRole("slider")).toBeNull();
    // #100：不提供上架／下架
    expect(screen.queryByRole("region", { name: "上架管理" })).toBeNull();
    expect(screen.queryByRole("button", { name: /上架|下架/ })).toBeNull();
    await waitFor(() => expect(preview.mounts).toBe(1));
  });
  it("#118 還沒製作 glb：直接轉到製作glb工作區，不載入示範貓", async () => {
    current.over = { hasAlbedo: false, status: "draft" };
    render(<HqToastProvider><CatPage id={cat.id} /></HqToastProvider>);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/MeowHQ/assets/cats/${cat.id}/studio`));
    expect(screen.queryByTestId("fake-preview")).toBeNull();
  });
  it("已產生的貼圖直接預覽目前版，不再停在待確認的上一版", async () => {
    current.over = { hasPrevAlbedo: true, texture: { state: "pending", preview: "albedo_prev", previewBody: "kitten" } };
    render(<HqToastProvider><CatPage id={cat.id} /></HqToastProvider>);
    await screen.findByTestId("fake-preview");
    expect(preview.last.albedoUrl).toBe(`/api/hq/cat-models/${cat.id}/file/albedo`);
    expect(preview.last.body).toBe("adult");
  });
  it("還沒有貼圖：轉到製作glb工作區", async () => {
    current.over = { hasAlbedo: false, texture: { state: "none", preview: null, previewBody: "adult" } };
    render(<HqToastProvider><CatPage id={cat.id} /></HqToastProvider>);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/MeowHQ/assets/cats/${cat.id}/studio`));
  });
  it("原貓咪資訊：喵戶在最上、有年齡、沒有補花紋", async () => {
    current.over = { ageMonths: 15 * 12, household: { id: "h1", name: "子哲中途" }, fillPattern: "tabby", photoView: "left" };
    render(<HqToastProvider><CatPage id={cat.id} /></HqToastProvider>);
    const info = await screen.findByRole("region", { name: "原貓咪資訊" });
    const labels = [...info.querySelectorAll(".hq-dl dt")].map(dt => dt.textContent);
    expect(labels).toEqual(["喵戶", "年齡", "體型骨架", "照片角度", "建立時間"]);
    expect(within(info).getByText("子哲中途")).toBeInTheDocument();
    expect(within(info).getByText("15 歲")).toBeInTheDocument();
    expect(within(info).queryByText("補花紋")).toBeNull();
  });
  it("#118 資訊區顯示其他角度照片", async () => {
    current.over = { extraPhotos: ["front", "back"] };
    render(<HqToastProvider><CatPage id={cat.id} /></HqToastProvider>);
    const panel = screen.getByRole("region", { name: "原貓咪資訊" });
    expect(within(panel).getByAltText("其他角度照片 2")).toHaveAttribute("src", `/api/hq/cat-models/${cat.id}/file/photo_front`);
    expect(within(panel).getByAltText("其他角度照片 3")).toHaveAttribute("src", `/api/hq/cat-models/${cat.id}/file/photo_back`);
  });
});
