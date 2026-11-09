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

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
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
    expect(screen.getAllByRole("button")).toHaveLength(12);
    expect(screen.getByRole("button", { name: "待機" })).toHaveAttribute("aria-pressed", "true");
    const eat = screen.getByRole("button", { name: /吃飯/ });
    expect(eat).toBeDisabled();
    expect(eat).toHaveTextContent("規劃中");
    fireEvent.click(screen.getByRole("button", { name: "走路" }));
    expect(pick).toHaveBeenCalledWith("walk");
    fireEvent.click(eat);
    expect(pick).toHaveBeenCalledTimes(1);
  });
  it("跳躍分成 A、B 兩顆（#287）：幼貓可點；成貓母體沒有時灰色、標示此體型尚無（不是規劃中）", () => {
    render(<ClipList available={["idle", "walk", "sleep", "sit", "jump_a", "jump_b"]} current="jump_b" onPick={() => {}} />);
    expect(screen.queryByRole("button", { name: /^跳躍$/ })).toBeNull();
    expect(screen.getByRole("button", { name: "跳躍-(下往上跳) A" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "跳躍-(往前跳) B" })).toHaveAttribute("aria-pressed", "true");
    cleanup();
    render(<ClipList available={["idle", "walk", "sleep", "sit"]} current="idle" onPick={() => {}} />);
    const b = screen.getByRole("button", { name: /跳躍-\(往前跳\) B/ });
    expect(b).toBeDisabled();
    expect(b).toHaveTextContent("此體型尚無");
    expect(b).not.toHaveTextContent("規劃中");
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
  it("大卡片連到影片轉換、平面圖轉換（#136 已移除寶麗來；#138 平面圖可進入，不再標規劃中）", () => {
    render(<RoomsTab />);
    expect(screen.getByRole("link", { name: /影片轉換/ })).toHaveAttribute("href", "/MeowHQ/assets?tab=rooms-video");
    expect(screen.queryByRole("link", { name: /寶麗來轉換/ })).toBeNull();
    expect(screen.getByRole("link", { name: /平面圖轉換/ })).toHaveAttribute("href", "/MeowHQ/assets?tab=rooms-floorplan");
    expect(screen.queryByText("規劃中")).toBeNull();
  });
});

describe("filterCats", () => {
  const cats = [
    cat({ id: "a", name: "虎斑範本", status: "ready", hasAlbedo: true }),
    cat({ id: "b", name: "三花", status: "running", createdBy: "Yucian" }),
    cat({ id: "c", name: "示範", status: "ready", hasAlbedo: true, builtin: true }),
  ];
  it("依名稱或建立者搜尋（不分大小寫）", () => {
    expect(filterCats(cats, { q: "虎斑" }).map(c => c.id)).toEqual(["a"]);
    expect(filterCats(cats, { q: "yucian" }).map(c => c.id)).toEqual(["b"]);
  });
  it("#159 依進度篩選：產生中／完成／示範貓", () => {
    expect(filterCats(cats, { status: "running" }).map(c => c.id)).toEqual(["b"]);
    expect(filterCats(cats, { status: "done" }).map(c => c.id)).toEqual(["a"]);
    expect(filterCats(cats, { status: "demo" }).map(c => c.id)).toEqual(["c"]);
  });
  it("沒有條件時全部顯示", () => expect(filterCats(cats, {})).toHaveLength(3));
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

  it("三視角完成：按「產生紋理貼圖」送出（固定 AI 左側面照、不補花紋；產生選項已移除）", async () => {
    const fetchMock = mockCat({ status: "draft", hasAlbedo: false, aiViews: ["left", "front", "back"] });
    renderStudio();
    fireEvent.click(await screen.findByRole("button", { name: "產生紋理貼圖" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/hq/cat-models/cat_20261031_100000/paint",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ view: "left", fill: "none" }) })));
    expect(screen.queryByRole("region", { name: "產生選項" })).toBeNull();
    expect(screen.queryByText("補看不到的花紋")).toBeNull();
  });
  it("雙體型：紋理貼圖用膠囊切換成貓／幼貓，產生時帶選到的體型；任務進度列出兩個體型的狀態、沒有上一版預覽", async () => {
    const texture = (body: "adult" | "kitten") => ({ state: "confirmed" as const, preview: "albedo" as const, previewBody: body });
    const fetchMock = mockCat({
      status: "queued", jobStatus: "queued", jobQueuedAt: new Date().toISOString(), jobStep: "排隊中", jobBody: "kitten",
      aiViews: ["left", "front", "back"], variantStorage: true, hasPrevAlbedo: true,
      bodyVariants: { adult: { albedoUrl: "https://x/a.png", prevUrl: "https://x/a0.png", baseVersion: "adult-v1", texture: texture("adult") } },
    });
    renderStudio();
    const status = await screen.findByRole("list", { name: "成貓、幼貓紋理貼圖狀態" });
    expect(within(status).getAllByRole("listitem").map(li => li.textContent)).toEqual(["成貓完成", "幼貓排隊中"]);
    const region = screen.getByRole("region", { name: "紋理貼圖" });
    expect(within(region).queryByAltText("上一版紋理貼圖")).toBeNull();
    const seg = within(region).getByRole("group", { name: "紋理貼圖體型" });
    expect(within(seg).getByRole("button", { name: "成貓" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(seg).getByRole("button", { name: "幼貓" }));
    expect(within(seg).getByRole("button", { name: "幼貓" })).toHaveAttribute("aria-pressed", "true");
    expect(within(region).getByText("幼貓紋理貼圖生成中")).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "產生幼貓紋理貼圖" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/paint"), expect.anything());
  });
  it("#135 還沒產生 AI 三視角：產生紋理貼圖停用，提示先完成第 2 步", async () => {
    mockCat({ status: "draft", hasAlbedo: false });
    renderStudio();
    expect(await screen.findByRole("button", { name: "產生紋理貼圖" })).toBeDisabled();
    expect(screen.getByText(/請先完成第 2 步「AI 三視角」/)).toBeInTheDocument();
    expect(screen.getByText("先完成 AI 三視角，再產生紋理貼圖。")).toBeInTheDocument();
  });
  it("#135 三視角只成功一部分或有失敗：仍停用", async () => {
    mockCat({ status: "draft", hasAlbedo: false, aiViews: ["left", "front"], aiErrors: { back: "產生逾時，請重新產生" } });
    renderStudio();
    expect(await screen.findByRole("button", { name: "產生紋理貼圖" })).toBeDisabled();
    expect(screen.getByText(/請先完成第 2 步「AI 三視角」/)).toBeInTheDocument();
  });
  it("#110 有 AI 左側面照：不用選照片角度", async () => {
    mockCat({ status: "draft", hasAlbedo: false, aiViews: ["left", "front", "back"] });
    renderStudio();
    expect(await screen.findByRole("button", { name: "產生紋理貼圖" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "左側" })).toBeNull();
    // #129：標題只保留一個「製作 GLB 工作區」，頁面標題改為貓咪名稱
    expect(screen.getAllByRole("heading", { name: /製作 ?glb工作區|製作 GLB 工作區/i })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "小橘" })).toBeInTheDocument();
  });
  it("#110 AI 照片產生中：產生紋理貼圖先停用並說明", async () => {
    mockCat({ status: "draft", hasAlbedo: false, aiRunning: ["left"] });
    renderStudio();
    expect(await screen.findByRole("button", { name: "產生紋理貼圖" })).toBeDisabled();
    expect(screen.getByText("AI 三視角產生中，完成後才能產生紋理貼圖。")).toBeInTheDocument();
  });
  it("排隊中：按鈕停用並說明原因；排隊超過 2 分鐘提示 worker 可能沒開", async () => {
    mockCat({ status: "queued", jobStatus: "queued", jobQueuedAt: new Date(Date.now() - 5 * 60000).toISOString(), jobStep: "排隊中" });
    renderStudio();
    expect(await screen.findByRole("button", { name: "重新產生紋理貼圖" })).toBeDisabled();
    expect(screen.getByText("已有排隊中或生成中的任務。")).toBeInTheDocument();
    expect(screen.getByText(/paint_worker 可能沒有開啟/)).toBeInTheDocument();
    // #129：任務進度標出「排隊」逾時，不顯示百分比
    const progress = screen.getByRole("list", { name: "紋理貼圖任務進度" });
    expect(within(progress).getByText("排隊逾時")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });
  it("失敗：顯示原因與「重試」，並說明沒動到現在的貼圖", async () => {
    mockCat({ status: "failed", jobStatus: "error", jobError: "CUDA out of memory", aiViews: ["left", "front", "back"] });
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
  it("已確認紋理貼圖：第 4 步提供「前往貓咪頁看動作」", async () => {
    mockCat({ status: "ready" });
    renderStudio();
    expect(await screen.findByRole("link", { name: "前往貓咪頁看動作" })).toHaveAttribute("href", "/MeowHQ/assets/cats/cat_20261031_100000");
  });
  it("舊的待確認貼圖直接採用：第 4 步可看動作，不再要求確認使用", async () => {
    mockCat({ status: "ready", hasPrevAlbedo: true, texture: { state: "pending", preview: "albedo_prev", previewBody: "adult" } });
    renderStudio();
    const step4 = await screen.findByRole("region", { name: "製作動作 glb" });
    expect(within(step4).getByRole("link", { name: "前往貓咪頁看動作" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "確認使用" })).toBeNull();
    expect(screen.getByText("目前使用・點圖放大")).toBeInTheDocument();
  });
  it("#129 生成中：貼圖區顯示「生成中」與目前步驟；首次生成顯示空狀態", async () => {
    mockCat({ status: "running", hasAlbedo: false, jobStatus: "running", jobStep: "AI 上色", jobStartedAt: new Date().toISOString() });
    renderStudio();
    const texture = await screen.findByRole("region", { name: "紋理貼圖" });
    expect(within(texture).getByText("生成中")).toBeInTheDocument();
    expect(within(texture).getByText("紋理貼圖生成中")).toBeInTheDocument();
    const progress = screen.getByRole("list", { name: "紋理貼圖任務進度" });
    expect(within(progress).getByText("AI 上色").closest("li")).toHaveAttribute("aria-current", "step");
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
    // 貓咪資訊、上傳照片、AI 三視角各自可收合（同「進階生成參數與畫質設定」），預設展開
    const folds = [...file.querySelectorAll("details")].map(d => [d.querySelector("summary")?.textContent, d.open]);
    expect(folds.slice(0, 3)).toEqual([["貓咪資訊", true], ["上傳照片", true], ["AI 三視角", true]]);
    expect(screen.getByRole("region", { name: "製作 GLB 工作區" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "產生選項" })).toBeNull();
    expect(screen.queryByRole("region", { name: "任務進度" })).toBeNull();
    // #129：貼圖預覽在右側工作區
    expect(within(screen.getByRole("region", { name: "製作 GLB 工作區" })).getByRole("region", { name: "紋理貼圖" })).toBeInTheDocument();
    expect(within(file).queryByRole("region", { name: "紋理貼圖" })).toBeNull();
    expect(screen.getByRole("button", { name: "收合虛擬貓咪檔案" })).toHaveTextContent("▾");
    expect(screen.getByRole("button", { name: "收合虛擬貓咪檔案" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "收合虛擬貓咪檔案" }));
    expect(screen.getByRole("button", { name: "展開虛擬貓咪檔案" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "展開虛擬貓咪檔案" })).toHaveTextContent("▸");
  });
});

describe("BaseSamples", () => {
  it("成貓、幼貓骨架各有「測試動作與參數」按鈕，連到骨架測試台", () => {
    render(<BaseSamples />);
    const links = screen.getAllByRole("link", { name: "測試動作與參數" });
    expect(links.map(l => l.getAttribute("href"))).toEqual(["/MeowHQ/assets/bases/adult", "/MeowHQ/assets/bases/kitten"]);
  });
});
