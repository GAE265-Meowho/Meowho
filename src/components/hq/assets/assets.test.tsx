// 虛擬體驗元件管理｜貓咪（規格書 04 §1、§2.2、§2.4、§5）
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatModelView } from "@/lib/hq/cat-models/types";
import { ClipList } from "./ClipList";
import { filterCats } from "./CatsTab";
import { PlannedTab } from "./PlannedTab";
import { PublishPanel } from "./PublishPanel";

vi.mock("../HqStates", async orig => ({ ...(await orig<typeof import("../HqStates")>()), useOnline: () => true }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const cat = (over: Partial<CatModelView>): CatModelView => ({
  id: "cat_20261031_100000", name: "小橘", ownerType: "template", status: "ready", ageMonths: null, weightKg: null, notes: "",
  photoView: null, fillPattern: null, hasAlbedo: true, hasPrevAlbedo: false, jobStep: null, jobError: null,
  createdAt: "2026-10-31T10:00:00", updatedAt: "2026-10-31T10:00:00", ...over,
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

describe("filterCats", () => {
  const cats = [cat({ id: "a", name: "虎斑範本", status: "ready" }), cat({ id: "b", name: "三花", status: "draft" })];
  it("依名稱搜尋（不分大小寫）", () => expect(filterCats(cats, { q: "虎斑" }).map(c => c.id)).toEqual(["a"]));
  it("依狀態篩選", () => expect(filterCats(cats, { status: "draft" }).map(c => c.id)).toEqual(["b"]));
  it("沒有條件時全部顯示", () => expect(filterCats(cats, {})).toHaveLength(2));
});

describe("PublishPanel", () => {
  it("草稿不能上架，並說明要先產生貼圖", () => {
    render(<PublishPanel id="x" status="draft" onDone={() => {}} />);
    expect(screen.getByRole("button", { name: "上架" })).toBeDisabled();
    expect(screen.getByText("要先產生貼圖才能上架")).toBeInTheDocument();
  });
  it("已完成的貓：原因必填，送出後呼叫 API 並通知", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const done = vi.fn();
    render(<PublishPanel id="cat_1" status="ready" onDone={done} />);
    fireEvent.click(screen.getByRole("button", { name: "上架" }));
    const confirm = screen.getByRole("button", { name: "確認上架" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("原因"), { target: { value: "預覽確認沒問題" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(done).toHaveBeenCalledWith("已上架"));
    expect(fetchMock).toHaveBeenCalledWith("/api/hq/cat-models/cat_1/publish", expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "publish", reason: "預覽確認沒問題" }) }));
  });
  it("已上架的貓顯示「下架」；已下架的貓顯示「重新上架」", () => {
    const { rerender } = render(<PublishPanel id="x" status="published" onDone={() => {}} />);
    expect(screen.getByRole("button", { name: "下架" })).toBeEnabled();
    rerender(<PublishPanel id="x" status="unpublished" onDone={() => {}} />);
    expect(screen.getByRole("button", { name: "重新上架" })).toBeEnabled();
  });
  it("API 回報狀態不符時，在按鈕旁顯示白話原因並保留表單", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "invalid_state" }) }));
    render(<PublishPanel id="cat_1" status="ready" onDone={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "上架" }));
    fireEvent.change(screen.getByLabelText("原因"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "確認上架" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("原因")).toHaveValue("x");
  });
});
