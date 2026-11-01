// 已建立的貓咪模型列表（#102）：欄位為縮圖、名稱、動作數、建立者、更新時間、備註說明；不顯示狀態與操作欄
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listBundledCats } from "@/lib/hq/cat-models/bundled";
import type { CatModelView } from "@/lib/hq/cat-models/types";
import { CatsTab } from "./CatsTab";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("./BaseSamples", () => ({ BaseSamples: () => null }));

const rows = vi.hoisted(() => ({ data: [] as CatModelView[] }));
vi.mock("./useCatModels", async orig => ({
  ...(await orig<typeof import("./useCatModels")>()),
  useCatList: () => ({ value: { state: "ready", data: rows.data }, reload: vi.fn() }),
}));

afterEach(() => cleanup());

const base = listBundledCats()[0];
const member: CatModelView = { ...base, id: "cat_20261101_200000", name: "小橘", status: "ready", notes: "", createdBy: "Tina", updatedAt: "2026-11-01T14:44:54Z" };

describe("已建立的貓咪模型列表（#102）", () => {
  it("欄位：縮圖、名稱、動作數、建立者、更新時間、備註說明", () => {
    rows.data = [member];
    render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    const headers = screen.getAllByRole("columnheader").map(h => h.textContent);
    expect(headers).toEqual(["縮圖", "名稱", "動作數", "建立者", "更新時間", "備註說明"]);
    const row = screen.getByRole("row", { name: /小橘/ });
    expect(within(row).getByText("Tina")).toBeInTheDocument();
    expect(within(row).getByText("2026/11/01 22:44")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument(); // 沒有備註
    expect(within(row).queryByRole("link", { name: /預覽動作|製作glb工作區/ })).toBeNull();
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
});
