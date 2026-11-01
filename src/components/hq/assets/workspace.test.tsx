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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../HqStates", async orig => ({ ...(await orig<typeof import("../HqStates")>()), useOnline: () => true }));

const cat: CatModelView = {
  id: "cat_20261031_100000", name: "小橘", ownerType: "template", status: "ready", ageMonths: null, weightKg: null, notes: "",
  photoView: "front", fillPattern: "none", hasAlbedo: true, hasPrevAlbedo: false, albedoVersion: null, body: "adult", jobStatus: null, jobQueuedAt: null, jobStartedAt: null, jobSeconds: null, jobStep: null, jobError: null,
  createdAt: "2026-10-31T10:00:00", updatedAt: "2026-10-31T10:00:00",
};
vi.mock("./useCatModels", async orig => ({
  ...(await orig<typeof import("./useCatModels")>()),
  useCat: () => ({ value: { state: "ready", data: cat }, reload: vi.fn() }),
}));

beforeEach(() => { preview.mounts = 0; preview.last = {}; });
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
    expect(groupTitles(panel)).toEqual(["播放與畫面", "動作", "眼睛"]);
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
    const eyes = panel.querySelector<HTMLDetailsElement>(":scope > details:last-of-type")!;
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
  it("上架留在頂部；預覽在左欄；右側面板分為播放與畫面、動作、資訊", async () => {
    render(<HqToastProvider><CatPage id={cat.id} /></HqToastProvider>);
    await screen.findByTestId("fake-preview");
    const stage = screen.getByRole("region", { name: "3D 預覽" });
    const panel = screen.getByRole("region", { name: "參數" });
    expect(within(stage).getByTestId("cat-canvas")).toBeInTheDocument();
    expect(groupTitles(panel)).toEqual(["播放與畫面", "動作", "資訊"]);
    for (const name of [/眨眼/, /瞳孔寬窄/, /環境亮度/]) {
      expect(within(panel).getByRole("slider", { name })).toBeInTheDocument();
    }
    expect(within(stage).queryByRole("slider")).toBeNull();
    expect(within(panel).queryByRole("button", { name: "上架" })).toBeNull();
    await waitFor(() => expect(preview.mounts).toBe(1));
  });
});
