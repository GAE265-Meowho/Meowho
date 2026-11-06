// 新增貓咪頁（#110 Stitch 兩步驟）：01 上傳照片與基本資料 → 02 AI 三視角；底部列「確認並前往製作glb工作區」
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { listBundledCats } from "@/lib/hq/cat-models/bundled";
import { NewCat } from "./NewCat";

const push = vi.fn();
const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }), useSearchParams: () => new URLSearchParams(search) }));
vi.mock("../HqStates", async orig => ({ ...(await orig<typeof import("../HqStates")>()), useOnline: () => true }));

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockReset(); replace.mockReset(); search = ""; });

const jpg = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const ID = "cat_20261102_120000";
const base = { ...listBundledCats()[0], ageMonths: 3, body: "kitten" as const, variantStorage: false, bodyVariants: undefined };

describe("新增貓咪頁（#110）", () => {
  it("步驟 01：照片｜基本資料兩欄；原始照片必填且會保留，其他角度 2、3 選填；底部按鈕先停用", () => {
    render(<NewCat />);
    const grid = screen.getByTestId("newcat-grid");
    expect(within(grid).getAllByRole("region").map(s => s.getAttribute("aria-label"))).toEqual(["貓咪照片", "基本資料"]);
    expect(screen.getByText("原始照片會保留")).toBeInTheDocument();
    const extras = screen.getByRole("group", { name: "照片上傳" });
    expect(within(extras).getAllByText("選填")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "確認並前往製作glb工作區 →" })).toBeDisabled();
    expect(screen.getByText("進階生成參數與畫質設定")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "拍攝範例" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("性別")).toBeInTheDocument();
  });
  it("#123 名稱與性別在同一個基本資料欄位列中", () => {
    render(<NewCat />);
    const row = screen.getByRole("group", { name: "名稱與性別" });
    expect(within(row).getByLabelText("名稱（必填）")).toBeInTheDocument();
    expect(within(row).getByLabelText("性別")).toBeInTheDocument();
  });
  it("沒選照片就按「產生 AI 三視角」：提示，不呼叫 API", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    render(<NewCat />);
    fireEvent.change(screen.getByLabelText("名稱（必填）"), { target: { value: "小橘" } });
    fireEvent.click(screen.getByRole("button", { name: "產生 AI 三視角" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("請先選一張貓咪照片");
    expect(f).not.toHaveBeenCalled();
  });
  it("本機模式：原始＋其他角度照片一起建立，送出三個角度與畫質，網址加 ?id=", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/upload")) return { ok: true, json: async () => ({ ok: true, mode: "inline" }) };
      if (url.endsWith("/views")) return { ok: true, status: 202, json: async () => ({ ok: true }) };
      if (url === `/api/hq/cat-models/${ID}`) return { ok: true, status: 200, json: async () => ({ enabled: true, cat: { ...base, id: ID, aiRunning: ["left", "front", "back"] } }) };
      return { ok: true, json: async () => ({ ok: true, id: ID }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<NewCat />);
    fireEvent.change(screen.getByLabelText("原始照片"), { target: { files: [jpg("side.jpg")] } });
    fireEvent.change(screen.getByLabelText("其他角度照片 2"), { target: { files: [jpg("front.jpg")] } });
    fireEvent.change(screen.getByLabelText("名稱（必填）"), { target: { value: "小灰" } });
    fireEvent.change(screen.getByLabelText("性別"), { target: { value: "female" } });
    fireEvent.click(screen.getByRole("button", { name: "產生 AI 三視角" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/MeowHQ/assets/cats/new?id=${ID}`));
    const create = fetchMock.mock.calls.find(([u]) => u === "/api/hq/cat-models")! as unknown as [string, { body: string }];
    expect(JSON.parse(create[1].body).extras.front).toMatch(/^data:image\/jpeg;base64,/);
    expect(JSON.parse(create[1].body).gender).toBe("female");
    const views = fetchMock.mock.calls.find(([u]) => u.endsWith("/views"))! as unknown as [string, { body: string }];
    expect(JSON.parse(views[1].body)).toEqual({ views: ["left", "front", "back"], quality: "low", size: "1024x1024" });
    expect(await screen.findByText(/AI 照片產生中/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認並前往製作glb工作區 →" })).toBeDisabled();
  });
  it("帶 ?id= 回來且已完成：顯示四張照片，按確認前往製作glb工作區", async () => {
    search = `id=${ID}`;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ enabled: true, cat: { ...base, id: ID, aiViews: ["left", "front", "back"], aiRunning: [], aiErrors: {} } }) })));
    render(<NewCat />);
    expect(await screen.findByAltText("AI 左側面照片")).toBeInTheDocument();
    const go = screen.getByRole("button", { name: "確認並前往製作glb工作區 →" });
    await waitFor(() => expect(go).toBeEnabled());
    fireEvent.click(go);
    expect(push).toHaveBeenCalledWith(`/MeowHQ/assets/cats/${ID}/studio`);
  });
});
