// 虛擬體驗元件管理｜貓咪（規格書 04 §1、§2.2、§2.4、§5）
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatModelView } from "@/lib/hq/cat-models/types";
import { BaseSamples } from "./BaseSamples";
import { ClipList } from "./ClipList";
import { filterCats } from "./CatsTab";
import { PlannedTab } from "./PlannedTab";
import { RoomsTab } from "./RoomsTab";
import { checkPhoto } from "./NewCat";
import { StudioPageBody } from "./StudioPage";
import { HqToastProvider } from "../HqToast";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../HqStates", async orig => ({ ...(await orig<typeof import("../HqStates")>()), useOnline: () => true }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const cat = (over: Partial<CatModelView>): CatModelView => ({
  id: "cat_20261031_100000", name: "小橘", ownerType: "template", status: "ready", ageMonths: null, weightKg: null, notes: "",
  photoView: null, fillPattern: null, hasAlbedo: true, hasPrevAlbedo: false, albedoVersion: null, body: "adult", jobStatus: null, jobQueuedAt: null, jobStartedAt: null, jobSeconds: null, jobStep: null, jobError: null,
  createdAt: "2026-10-31T10:00:00", updatedAt: "2026-10-31T10:00:00", createdBy: null, extraPhotos: [], aiViews: [], aiRunning: [], aiErrors: {}, aiAge: null, aiPrompts: {}, aiUsage: {}, aiQuality: null, ...over,
});

describe("ClipList（UT 動作清單）", () => {
  it("列出動作庫全部動作：已有的可點，規劃中的灰色不可點並標示規劃中", () => {
    const pick = vi.fn();
    render(<ClipList available={["idle", "walk", "sleep"]} current="idle" onPick={pick} />);
    expect(screen.getAllByRole("button")).toHaveLength(9);
    expect(screen.getByRole("button", { name: "待機" })).toHaveAttribute("aria-pressed", "true");
    const eat = screen.getByRole("button", { name: /吃飯/ });
    expect(eat).toBeDisabled();
    expect(eat).toHaveTextContent("規劃中");
    fireEvent.click(screen.getByRole("button", { name: "走路" }));
    expect(pick).toHaveBeenCalledWith("walk");
    fireEvent.click(eat);
    expect(pick).toHaveBeenCalledTimes(1);
  });
  it("母體補入新動作後自動可點", () => {
    render(<ClipList available={["idle", "walk", "sleep", "eat"]} current={null} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: "吃飯" })).toBeEnabled();
  });
});

describe("PlannedTab", () => {
  it("顯示規劃中與說明，沒有上傳按鈕", () => {
    render(<PlannedTab label="室內空間" examples="房間、場景" />);
    expect(screen.getAllByText("規劃中").length).toBeGreaterThan(0);
    expect(screen.getByText("這個分類還在規劃，之後會在這裡管理。")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("RoomsTab（#113）", () => {
  it("兩張大卡片連到寶麗來轉換、平面圖轉換，標示規劃中", () => {
    render(<RoomsTab />);
    expect(screen.getByRole("link", { name: /寶麗來轉換/ })).toHaveAttribute("href", "/MeowHQ/assets?tab=rooms-polaroid");
    expect(screen.getByRole("link", { name: /平面圖轉換/ })).toHaveAttribute("href", "/MeowHQ/assets?tab=rooms-floorplan");
    expect(screen.getAllByText("規劃中")).toHaveLength(2);
  });
});

describe("filterCats", () => {
  const cats = [cat({ id: "a", name: "虎斑範本", status: "ready" }), cat({ id: "b", name: "三花", status: "draft" })];
  it("依名稱搜尋（不分大小寫）", () => expect(filterCats(cats, { q: "虎斑" }).map(c => c.id)).toEqual(["a"]));
  it("依狀態篩選", () => expect(filterCats(cats, { status: "draft" }).map(c => c.id)).toEqual(["b"]));
  it("沒有條件時全部顯示", () => expect(filterCats(cats, {})).toHaveLength(2));
});

describe("checkPhoto", () => {
  it("接受 JPG、PNG、WebP", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(checkPhoto({ type, size: 1000 })).toBeNull();
  });
  it("其他格式與超過 10 MB 說明白話原因", () => {
    expect(checkPhoto({ type: "image/gif", size: 1000 })).toBe("請上傳 JPG、PNG 或 WebP 照片");
    expect(checkPhoto({ type: "image/png", size: 10 * 1024 * 1024 + 1 })).toBe("照片太大（上限 10 MB）");
  });
});

describe("製作glb工作區", () => {
  function mockCat(over: Partial<CatModelView>) {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: { method?: string }) => ({
      ok: true, status: 200, json: async () => (init?.method === "POST" ? { ok: true } : { enabled: true, cat: cat(over) }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const renderStudio = () => render(<HqToastProvider><StudioPageBody id="cat_20261031_100000" /></HqToastProvider>);

  it("草稿：預設正面、不補花紋；按「產生動作 glb」送出選項", async () => {
    const fetchMock = mockCat({ status: "draft", hasAlbedo: false });
    renderStudio();
    fireEvent.click(await screen.findByRole("button", { name: "左側" }));
    fireEvent.click(screen.getByRole("button", { name: "虎斑" }));
    fireEvent.click(screen.getByRole("button", { name: "產生動作 glb" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/hq/cat-models/cat_20261031_100000/paint",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ view: "left", fill: "tabby" }) })));
  });
  it("#110 有 AI 左側面照：不用選照片角度，說明用 AI 照片上色", async () => {
    mockCat({ status: "draft", hasAlbedo: false, aiViews: ["left", "front", "back"] });
    renderStudio();
    expect(await screen.findByText("使用 AI 左側面照（頭朝左）上色；原始照片保留在貼圖結果。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "左側" })).toBeNull();
    expect(screen.getByRole("heading", { name: "製作glb工作區" })).toBeInTheDocument();
  });
  it("#110 AI 照片產生中：產生 glb 先停用並說明", async () => {
    mockCat({ status: "draft", hasAlbedo: false, aiRunning: ["left"] });
    renderStudio();
    expect(await screen.findByRole("button", { name: "產生動作 glb" })).toBeDisabled();
    expect(screen.getByText("AI 照片產生中，完成後再送出。")).toBeInTheDocument();
  });
  it("排隊中：按鈕停用並說明原因；排隊超過 2 分鐘提示 worker 可能沒開", async () => {
    mockCat({ status: "queued", jobStatus: "queued", jobQueuedAt: new Date(Date.now() - 5 * 60000).toISOString(), jobStep: "排隊中" });
    renderStudio();
    expect(await screen.findByRole("button", { name: "重新產生動作 glb" })).toBeDisabled();
    expect(screen.getByText("已有排隊中或生成中的任務，完成後才能再送出。")).toBeInTheDocument();
    expect(screen.getByText(/paint_worker 可能沒有開啟/)).toBeInTheDocument();
  });
  it("失敗：顯示原因與「重試」，並說明沒動到現在的貼圖", async () => {
    mockCat({ status: "failed", jobStatus: "error", jobError: "CUDA out of memory" });
    renderStudio();
    expect(await screen.findByRole("button", { name: "重試" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("CUDA out of memory");
  });
  it("沒有上一版時「改用上一版」停用；有上一版時需填原因才能確認", async () => {
    mockCat({ status: "ready", hasPrevAlbedo: false });
    const { unmount } = renderStudio();
    expect(await screen.findByRole("button", { name: "改用上一版" })).toBeDisabled();
    unmount();
    const fetchMock = mockCat({ status: "ready", hasPrevAlbedo: true });
    renderStudio();
    fireEvent.click(await screen.findByRole("button", { name: "改用上一版" }));
    const confirm = screen.getByRole("button", { name: "確認改用上一版" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("原因"), { target: { value: "顏色不對" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/hq/cat-models/cat_20261031_100000/restore",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "顏色不對" }) })));
  });
  it("#118 還沒有 3D：返回連結回列表（貓咪頁會轉回工作區，避免繞圈）", async () => {
    mockCat({ status: "draft", hasAlbedo: false });
    renderStudio();
    expect(await screen.findByRole("link", { name: "← 虛擬體驗元件管理" })).toHaveAttribute("href", "/MeowHQ/assets");
  });
  it("有貼圖時提供「回到貓咪頁看動作」", async () => {
    mockCat({ status: "ready" });
    renderStudio();
    expect(await screen.findByRole("link", { name: "回到貓咪頁看動作" })).toHaveAttribute("href", "/MeowHQ/assets/cats/cat_20261031_100000");
  });
  it("#123 將虛擬貓咪檔案和 GLB 工作區分成兩區，檔案區可收合", async () => {
    mockCat({ status: "ready", gender: "female", ageMonths: 18, weightKg: 4.2, notes: "愛曬太陽" });
    renderStudio();

    const file = await screen.findByRole("region", { name: "虛擬貓咪檔案" });
    expect(within(file).getByText("小橘")).toBeInTheDocument();
    expect(within(file).getByText("母")).toBeInTheDocument();
    expect(within(file).getByText("18 個月")).toBeInTheDocument();
    expect(within(file).getByText("4.2 公斤")).toBeInTheDocument();
    expect(within(file).getByRole("group", { name: "上傳照片" })).toBeInTheDocument();
    expect(within(file).getByRole("group", { name: "AI 三視角" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "製作 GLB 工作區" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "產生選項" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "任務進度" })).toBeNull();
    expect(screen.getByRole("button", { name: "收合虛擬貓咪檔案" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "收合虛擬貓咪檔案" }));
    expect(screen.getByRole("button", { name: "展開虛擬貓咪檔案" })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("BaseSamples", () => {
  it("成貓、幼貓骨架各有「測試動作與參數」按鈕，連到骨架測試台", () => {
    render(<BaseSamples />);
    const links = screen.getAllByRole("link", { name: "測試動作與參數" });
    expect(links.map(l => l.getAttribute("href"))).toEqual(["/MeowHQ/assets/bases/adult", "/MeowHQ/assets/bases/kitten"]);
  });
});
