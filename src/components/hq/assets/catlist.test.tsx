// 已建立的貓咪模型列表（#102）：欄位為縮圖、名稱、進度、建立者、更新時間、備註說明、操作（刪除）；不顯示狀態
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listBundledCats } from "@/lib/hq/cat-models/bundled";
import type { CatModelView } from "@/lib/hq/cat-models/types";
import { CatsTab } from "./CatsTab";

const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock("../HqToast", () => ({ useHqToast: () => toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const rows = vi.hoisted(() => ({ data: [] as CatModelView[] }));
vi.mock("./useCatModels", async orig => ({
  ...(await orig<typeof import("./useCatModels")>()),
  useCatList: () => ({ value: { state: "ready", data: rows.data }, reload: vi.fn() }),
}));

afterEach(() => cleanup());

const base = listBundledCats()[0];
// MeowHQ 新增的貓在資料庫是 owner_type='template'，也要能刪（只有內建示範貓 builtin 不能刪）
const member: CatModelView = { ...base, ownerType: "template", builtin: false, id: "cat_20261101_200000", name: "小橘", status: "ready", notes: "", createdBy: "Tina", updatedAt: "2026-11-01T14:44:54Z" };

describe("已建立的貓咪模型列表（#102）", () => {
  it("欄位：縮圖、名稱、動作數、建立者、更新時間、備註說明", () => {
    rows.data = [member];
    render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    const headers = screen.getAllByRole("columnheader").map(h => h.textContent);
    expect(headers).toEqual(["縮圖", "名稱", "進度", "建立者", "更新時間", "備註說明", "操作"]); // #118 動作數換成進度
    const row = screen.getByRole("row", { name: /小橘/ });
    expect(within(row).getByText("Tina")).toBeInTheDocument();
    expect(within(row).getByText("2026/11/01 22:44")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument(); // 沒有備註
    expect(within(row).queryByRole("link", { name: /預覽動作|製作glb工作區/ })).toBeNull();
  });
  it("#110：流程改成上傳照片 → AI 三視角 → 產生 3D；兩隻骨架改用「體型骨架預覽」按鈕進入", () => {
    rows.data = [];
    render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    expect(screen.getByText("AI 三視角")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "體型骨架預覽" })).toHaveAttribute("href", "/MeowHQ/assets/bases");
    expect(screen.queryByRole("link", { name: "測試動作與參數" })).toBeNull();
  });
  it("#118 進度欄；還沒有 3D 的貓連到製作glb工作區，有 3D 的連到貓咪頁", () => {
    rows.data = [
      { ...member, id: "cat_20261102_010000", name: "沒3D", hasAlbedo: false, status: "draft", aiViews: ["left", "front", "back"], aiRunning: [] },
      { ...member, id: "cat_20261102_020000", name: "有3D", hasAlbedo: true, status: "ready" },
    ];
    render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    expect(within(screen.getByRole("row", { name: /沒3D/ })).getByText("2/4 AI 三視角・完成")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /有3D/ })).getByText("完成")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "沒3D" })).toHaveAttribute("href", "/MeowHQ/assets/cats/cat_20261102_010000/studio");
    expect(screen.getByRole("link", { name: "有3D" })).toHaveAttribute("href", "/MeowHQ/assets/cats/cat_20261102_020000");
  });
  it("不顯示狀態與狀態篩選", () => {
    rows.data = [member];
    render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    expect(screen.queryByText(/已上架|已下架|已完成/)).toBeNull();
    expect(screen.queryByRole("group", { name: /狀態/ })).toBeNull();
  });
  it("兩隻示範貓：建立者「系統」、備註「系統預設範例」", () => {
    const cats = listBundledCats();
    expect(cats.map(c => c.name)).toEqual(["第一隻虎斑貓", "好奇虎斑小貓"]);
    for (const c of cats) {
      expect(c.notes).toBe("系統預設範例");
      expect(c.createdBy).toBe("系統");
    }
  });
  it("刪除：按「刪除」後原位確認，送出 DELETE；示範貓不能刪", async () => {
    rows.data = [member, { ...member, id: "cat_20261101_210000", name: "範本", builtin: true }];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    expect(within(screen.getByRole("row", { name: /範本/ })).queryByRole("button", { name: /刪除/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "刪除小橘" }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/hq/cat-models/${member.id}`, { method: "DELETE" }));
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith({ message: "已刪除「小橘」" }));
    vi.unstubAllGlobals();
  });
});
