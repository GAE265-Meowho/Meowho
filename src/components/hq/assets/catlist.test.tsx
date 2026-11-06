// 已建立的貓咪模型列表（#102；#159 改版）：貓咪模型、進度、備註說明、建立者／更新、操作；依進度篩選
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

const base: CatModelView = { ...listBundledCats()[0], variantStorage: false, bodyVariants: undefined };
// MeowHQ 新增的貓在資料庫是 owner_type='template'，也要能刪（只有內建示範貓 builtin 不能刪）
const member: CatModelView = { ...base, ownerType: "template", builtin: false, id: "cat_20261101_200000", name: "小橘", status: "ready", notes: "", createdBy: "Tina", updatedAt: "2026-11-01T14:44:54Z" };

describe("已建立的貓咪模型列表（#102）", () => {
  it("#159 欄位：貓咪模型、進度、備註說明、建立者／更新、操作", () => {
    rows.data = [member];
    render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    const headers = screen.getAllByRole("columnheader").map(h => h.textContent);
    expect(headers).toEqual(["貓咪模型", "進度", "備註說明", "建立者／更新", "操作"]);
    const row = screen.getByRole("row", { name: /小橘/ });
    expect(within(row).getByText("Tina")).toBeInTheDocument();
    expect(within(row).getByText("2026/11/01 22:44")).toBeInTheDocument();
    expect(within(row).getByText("尚未填寫")).toBeInTheDocument(); // 沒有備註
    expect(within(row).queryByRole("link", { name: /預覽動作|製作glb工作區/ })).toBeNull();
  });
  it("#181 前台中途建的貓在「貓咪模型」欄名稱下顯示所屬喵戶；MeowHQ 自建的不顯示", () => {
    rows.data = [{ ...member, ownerType: "member", household: { id: "h1", name: "小橘之家" }, notes: "前台" }];
    const { unmount } = render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    expect(within(screen.getByRole("row", { name: /小橘/ })).getByText("喵戶：小橘之家")).toBeInTheDocument();
    unmount();
    rows.data = [member];
    render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    expect(within(screen.getByRole("row", { name: /小橘/ })).queryByText(/喵戶：/)).toBeNull();
  });
  it("#110：流程改成上傳照片 → AI 三視角 → 產生 3D；照片與三視角共用，第 3 步起成貓、幼貓分流；兩隻骨架改用「體型骨架預覽」按鈕進入", () => {
    rows.data = [];
    render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    expect(screen.getByRole("list", { name: "成貓、幼貓共用的步驟" })).toHaveTextContent("AI 三視角");
    for (const name of ["成貓製作流程", "幼貓製作流程"]) {
      const lane = screen.getByRole("list", { name });
      expect(lane).toHaveTextContent("STEP 03");
      expect(lane).toHaveTextContent("產生紋理貼圖");
      expect(lane).not.toHaveTextContent("AI 三視角");
    }
    expect(screen.getByRole("button", { name: "補排紋理貼圖" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "體型骨架預覽" })).toHaveAttribute("href", "/MeowHQ/assets/bases");
    expect(screen.queryByRole("link", { name: "測試動作與參數" })).toBeNull();
  });
  it("#118 進度欄；還沒有 3D 的貓連到製作glb工作區，有 3D 的連到貓咪頁", () => {
    rows.data = [
      { ...member, id: "cat_20261102_010000", name: "沒3D", hasAlbedo: false, status: "draft", aiViews: ["left", "front", "back"], aiRunning: [] },
      { ...member, id: "cat_20261102_020000", name: "有3D", hasAlbedo: true, status: "ready" },
    ];
    render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    const draft = screen.getByRole("row", { name: /沒3D/ });
    expect(within(draft).getByRole("progressbar", { name: "2/4 AI 三視角・完成" })).toHaveAttribute("aria-valuenow", "2");
    expect(within(screen.getByRole("row", { name: /有3D/ })).getByText("完成")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "沒3D" })).toHaveAttribute("href", "/MeowHQ/assets/cats/cat_20261102_010000/studio");
    expect(screen.getByRole("link", { name: "有3D" })).toHaveAttribute("href", "/MeowHQ/assets/cats/cat_20261102_020000");
  });
  it("#159 依進度篩選：全部、產生中、完成、示範貓，寫入網址參數 status", () => {
    rows.data = [member];
    const update = vi.fn();
    render(<CatsTab query={{ page: 1 }} update={update} />);
    const chips = within(screen.getByRole("group", { name: "依進度篩選" }));
    expect(chips.getAllByRole("button").map(b => b.textContent)).toEqual(["全部", "產生中 0", "完成 1", "示範貓 0"]);
    fireEvent.click(chips.getByRole("button", { name: "完成 1" }));
    expect(update).toHaveBeenCalledWith({ status: "done", page: 1 });
    expect(screen.queryByText(/已上架|已下架/)).toBeNull();
  });
  it("示範貓只剩一隻（好奇虎斑小貓併成牠的幼貓體型）：建立者「系統」、備註「系統預設範例」，成貓、幼貓都完成", () => {
    const cats = listBundledCats();
    expect(cats.map(c => c.name)).toEqual(["第一隻虎斑貓"]);
    expect(cats[0]).toMatchObject({ notes: "系統預設範例", createdBy: "系統" });
    rows.data = cats;
    render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    expect(within(screen.getByRole("row", { name: /第一隻虎斑貓/ })).getAllByText(/完成/).map(t => t.textContent)).toEqual(["成貓 完成", "幼貓 完成"]);
  });
  it("刪除：按「刪除」後原位確認，送出 DELETE；示範貓不能刪", async () => {
    rows.data = [member, { ...member, id: "cat_20261101_210000", name: "範本", builtin: true }];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    const demo = screen.getByRole("row", { name: /範本/ });
    expect(within(demo).queryByRole("button", { name: /刪除/ })).toBeNull();
    expect(within(demo).getByText("不可刪除")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "刪除小橘" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/3D 模型與貼圖會一併刪除，無法復原/)).toBeInTheDocument();
    expect(screen.queryByText(/進行中的任務會一併取消/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/hq/cat-models/${member.id}`, { method: "DELETE" }));
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith({ message: "已刪除「小橘」" }));
    vi.unstubAllGlobals();
  });
  it("#159 排隊或生成中也能刪除，確認時說明任務會一併取消", () => {
    rows.data = [{ ...member, name: "產生中", status: "running" }];
    render(<CatsTab query={{ page: 1 }} update={() => {}} />);
    const row = screen.getByRole("row", { name: /產生中/ });
    expect(within(row).getByRole("progressbar", { name: "3/4 紋理貼圖・產生中" })).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "刪除產生中" }));
    expect(screen.getByText(/進行中的任務會一併取消/)).toBeInTheDocument();
    expect(screen.queryByText(/排隊或生成中不能刪除/)).toBeNull();
  });
});
