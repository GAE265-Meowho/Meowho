// 平面圖轉換畫面（#138）：一戶清單、新增一戶、上傳房間（三步上傳）、原圖預覽、改名與刪除
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FloorplanHouse as House } from "@/lib/hq/floorplans/types";
import { HqToastProvider } from "../HqToast";
import { FloorplanHouse } from "./FloorplanHouse";
import { FloorplanTab } from "./FloorplanTab";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

const H = "room_20261102_220000";
const house = (over: Partial<House> = {}): House => ({
  id: H, name: "小美家", updatedAt: "2026-11-02T14:00:00Z",
  rooms: [
    { id: "r1", name: "客廳", image_path: `floorplans/${H}/r1.png`, status: "uploaded", created_at: "x", imageUrl: "https://blob/r1.png?sas" },
    { id: "r2", name: "主臥", image_path: `floorplans/${H}/r2.jpg`, status: "uploaded", created_at: "x", imageUrl: "https://blob/r2.jpg?sas" },
  ],
  ...over,
});
type Call = [string, RequestInit | undefined];
let calls: Call[];
function mockFetch(routes: (url: string, init?: RequestInit) => { status?: number; body?: unknown }) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    const r = routes(url, init);
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body ?? {} };
  }));
}
const wrap = (ui: React.ReactNode) => render(<HqToastProvider>{ui}</HqToastProvider>);

beforeEach(() => nav.push.mockReset());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("一戶清單（#138）", () => {
  it("一戶一列，連到工作頁；建立後直接進入新的一戶", async () => {
    mockFetch((url, init) => init?.method === "POST" ? { status: 201, body: { ok: true, id: H } }
      : { body: { houses: [{ id: H, name: "小美家", roomCount: 2, updatedAt: "2026-11-02T14:00:00Z" }], storage: true } });
    wrap(<FloorplanTab />);
    const table = await screen.findByRole("table", { name: "平面圖清單" });
    expect(within(table).getByRole("link", { name: "小美家" })).toHaveAttribute("href", `/MeowHQ/assets/floorplans/${H}`);
    expect(within(table).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "建立" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("戶名"), { target: { value: "阿明家" } });
    fireEvent.click(screen.getByRole("button", { name: "建立" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/MeowHQ/assets/floorplans/${H}`));
    expect(JSON.parse(String(calls.find(c => c[1]?.method === "POST")![1]!.body))).toEqual({ name: "阿明家" });
  });
  it("沒有資料時說明下一步；沒設定 Azure 時提醒", async () => {
    mockFetch(() => ({ body: { houses: [], storage: false } }));
    wrap(<FloorplanTab />);
    expect(await screen.findByText(/還沒有任何一戶/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("尚未設定 Azure Blob");
  });
});

describe("一戶的工作頁（#138）", () => {
  it("房間清單＋原圖預覽（預設第一間，點別間切換）", async () => {
    mockFetch(() => ({ body: { house: house(), storage: true } }));
    wrap(<FloorplanHouse id={H} />);
    const list = await screen.findByRole("list", { name: "房間清單" });
    expect(within(list).getAllByText("待讀圖")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "房間（2／8）" })).toBeInTheDocument();
    const preview = screen.getByRole("region", { name: "原圖預覽" });
    expect(within(preview).getByAltText("客廳的平面圖")).toHaveAttribute("src", "https://blob/r1.png?sas");
    expect(within(preview).getByRole("link", { name: "放大看客廳的原圖" })).toHaveAttribute("target", "_blank");
    fireEvent.click(within(list).getByRole("button", { name: /主臥/ }));
    expect(within(preview).getByAltText("主臥的平面圖")).toBeInTheDocument();
  });
  it("上傳：先拿網址、直接 PUT 到 Azure、再通知加入；選 PDF 會擋", async () => {
    mockFetch((url, init) => {
      if (url === `/api/hq/floorplans/${H}/rooms` && init?.method === "POST") {
        const b = JSON.parse(String(init.body));
        return "roomId" in b ? { status: 201, body: { ok: true } }
          : { body: { ok: true, roomId: "r3", path: `floorplans/${H}/r3.png`, upload: { url: "https://blob/up?sas", headers: { "x-ms-blob-type": "BlockBlob" } } } };
      }
      if (url === "https://blob/up?sas") return {};
      return { body: { house: house({ rooms: [] }), storage: true } };
    });
    wrap(<FloorplanHouse id={H} />);
    const input = await screen.findByLabelText("平面圖（JPG 或 PNG，10 MB 以內）");
    fireEvent.change(input, { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("請選 JPG 或 PNG 平面圖");
    expect(screen.getByRole("button", { name: "上傳" })).toBeDisabled();
    const png = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [png] } });
    fireEvent.change(screen.getByLabelText("房間名稱（選填）"), { target: { value: "書房" } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));
    await waitFor(() => expect(calls.filter(c => c[1]?.method === "POST")).toHaveLength(2));
    const put = calls.find(c => c[0] === "https://blob/up?sas")!;
    expect(put[1]).toMatchObject({ method: "PUT", headers: { "x-ms-blob-type": "BlockBlob" }, body: png });
    const posts = calls.filter(c => c[1]?.method === "POST").map(c => JSON.parse(String(c[1]!.body)));
    expect(posts).toEqual([{ type: "image/png", size: 1 }, { roomId: "r3", path: `floorplans/${H}/r3.png`, name: "書房" }]);
  });
  it("改名、刪除房間要再確認一次", async () => {
    mockFetch(() => ({ body: { house: house(), storage: true } }));
    wrap(<FloorplanHouse id={H} />);
    const preview = await screen.findByRole("region", { name: "原圖預覽" });
    fireEvent.change(within(preview).getByLabelText("房間名稱"), { target: { value: "大客廳" } });
    fireEvent.click(within(preview).getByRole("button", { name: "改名" }));
    await waitFor(() => expect(calls.some(c => c[1]?.method === "PATCH")).toBe(true));
    expect(calls.find(c => c[1]?.method === "PATCH")![0]).toBe(`/api/hq/floorplans/${H}/rooms/r1`);
    fireEvent.click(within(preview).getByRole("button", { name: "刪除房間" }));
    fireEvent.click(within(preview).getByRole("button", { name: "確認刪除這個房間" }));
    await waitFor(() => expect(calls.some(c => c[1]?.method === "DELETE")).toBe(true));
  });
  it("房間滿 8 間就不顯示上傳；沒設定 Azure 時說明原因", async () => {
    const rooms = Array.from({ length: 8 }, (_, i) => ({ ...house().rooms[0], id: `r${i + 1}` }));
    mockFetch(() => ({ body: { house: house({ rooms }), storage: true } }));
    const { unmount } = wrap(<FloorplanHouse id={H} />);
    await screen.findByRole("list", { name: "房間清單" });
    expect(screen.queryByRole("button", { name: "上傳" })).toBeNull();
    unmount();
    mockFetch(() => ({ body: { house: house({ rooms: [] }), storage: false } }));
    wrap(<FloorplanHouse id={H} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("尚未設定 Azure Blob");
  });
});
