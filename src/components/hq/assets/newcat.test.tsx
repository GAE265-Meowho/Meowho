// 新增貓咪頁（#105）：1 照片｜2 基本資料各佔一半；側面必填，正面、背部花紋可選填上傳
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NewCat } from "./NewCat";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("../HqStates", async orig => ({ ...(await orig<typeof import("../HqStates")>()), useOnline: () => true }));

beforeAll(() => {
  // jsdom 沒有 createObjectURL
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockReset(); });

const jpg = (name: string) => new File(["x"], name, { type: "image/jpeg" });

describe("新增貓咪頁版面（#105）", () => {
  it("兩個步驟並排：1 貓咪照片、2 基本資料；主要按鈕在兩欄之後", () => {
    render(<NewCat />);
    const grid = screen.getByTestId("newcat-grid");
    const steps = within(grid).getAllByRole("region");
    expect(steps.map(s => s.getAttribute("aria-label"))).toEqual(["照片", "基本資料"]);
    const save = screen.getByRole("button", { name: "儲存並前往貼圖工作頁" });
    expect(grid.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("三個角度都能上傳：側面必填，正面、背部花紋選填", () => {
    render(<NewCat />);
    const angles = screen.getByRole("group", { name: "照片角度" });
    expect(within(angles).getByText("必填・用來上色")).toBeInTheDocument();
    expect(within(angles).getAllByText("選填")).toHaveLength(2);
    expect(within(angles).getByLabelText("側面全身照片")).toBeInTheDocument();
    expect(within(angles).getByLabelText("正面照片")).toBeInTheDocument();
    expect(within(angles).getByLabelText("背部花紋照片")).toBeInTheDocument();
    expect(within(angles).queryByText("規劃中")).toBeNull();
  });
  it("選了正面照會顯示預覽；本機模式儲存時正面照一起送出", async () => {
    const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
      if (url.endsWith("/upload")) return { ok: true, json: async () => ({ ok: true, mode: "inline" }) };
      return { ok: true, json: async () => ({ ok: true, id: "cat_20261101_230000", body: init?.body }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<NewCat />);
    fireEvent.change(screen.getByLabelText("側面全身照片"), { target: { files: [jpg("side.jpg")] } });
    fireEvent.change(screen.getByLabelText("正面照片"), { target: { files: [jpg("front.jpg")] } });
    expect(screen.getByAltText("選好的正面照片預覽")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("名稱（必填）"), { target: { value: "小灰" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存並前往貼圖工作頁" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const create = fetchMock.mock.calls.find(([u]) => u === "/api/hq/cat-models")!;
    const body = JSON.parse(String(create[1]!.body));
    expect(body.extras.front).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.extras.back).toBeUndefined();
  });
});
