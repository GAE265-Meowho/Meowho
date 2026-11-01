// 貓咪頁補傳正面／背部花紋照（#107）
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtraPhotos } from "./ExtraPhotos";

vi.mock("../HqStates", async orig => ({ ...(await orig<typeof import("../HqStates")>()), useOnline: () => true }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ID = "cat_20261101_152953";
const jpg = new File(["x"], "back.jpg", { type: "image/jpeg" });

describe("ExtraPhotos（#107）", () => {
  it("已有的顯示照片與「換一張」，沒有的顯示「上傳」", () => {
    render(<ExtraPhotos id={ID} have={["front"]} version="v1" onDone={() => {}} />);
    const group = screen.getByRole("group", { name: "其他角度照片" });
    expect(within(group).getByAltText("正面照片")).toHaveAttribute("src", `/api/hq/cat-models/${ID}/file/photo_front?t=v1`);
    expect(within(group).getByText("換一張")).toBeInTheDocument();
    expect(within(group).getByText("上傳")).toBeInTheDocument();
    expect(within(group).getByLabelText("上傳背部花紋照片")).toBeInTheDocument();
  });
  it("本機模式：選了照片就送出，完成後通知", async () => {
    const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => ({ init,
      ok: true, json: async () => (url.endsWith("/upload") ? { ok: true, mode: "inline" } : { ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const done = vi.fn();
    render(<ExtraPhotos id={ID} have={[]} version="v1" onDone={done} />);
    fireEvent.change(screen.getByLabelText("上傳背部花紋照片"), { target: { files: [jpg] } });
    await waitFor(() => expect(done).toHaveBeenCalledWith("已上傳背部花紋照片"));
    const call = fetchMock.mock.calls.find(([u]) => u === `/api/hq/cat-models/${ID}/photos`)!;
    const body = JSON.parse(String(call[1]?.body));
    expect(body.view).toBe("back");
    expect(body.photo).toMatch(/^data:image\/jpeg;base64,/);
  });
  it("格式不對：顯示錯誤，不呼叫 API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ExtraPhotos id={ID} have={[]} version="v1" onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText("上傳正面照片"), { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("請上傳 JPG、PNG 或 WebP 照片");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
