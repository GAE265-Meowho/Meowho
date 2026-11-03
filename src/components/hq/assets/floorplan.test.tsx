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
    { id: "r1", name: "客廳", image_path: `floorplans/${H}/r1.png`, status: "uploaded", created_at: "x", imageUrl: "https://blob/r1.png?sas", photoUrls: [] },
    { id: "r2", name: "主臥", image_path: `floorplans/${H}/r2.jpg`, status: "uploaded", created_at: "x", imageUrl: "https://blob/r2.jpg?sas", photoUrls: [] },
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

const summary = (over = {}) => ({
  id: H, name: "小美家", roomCount: 2, updatedAt: "2026-11-02T14:00:00Z", createdBy: "Tina",
  rooms: [{ id: "r1", name: "客廳", status: "uploaded", imageUrl: "https://blob/r1.png?sas" }, { id: "r2", name: "主臥", status: "uploaded", imageUrl: "https://blob/r2.png?sas" }],
  ...over,
});

describe("平面圖轉換一頁完成（#138）", () => {
  it("每一戶一張預覽卡片：封面是第一張平面圖，列出房間、建立者、更新時間；「管理」進去補傳", async () => {
    mockFetch(() => ({ body: { houses: [summary()], storage: true } }));
    wrap(<FloorplanTab />);
    const list = await screen.findByRole("list", { name: "平面圖清單" });
    expect(within(list).getByAltText("小美家的客廳平面圖")).toHaveAttribute("src", "https://blob/r1.png?sas");
    expect(within(within(list).getByRole("list", { name: "小美家的房間" })).getAllByRole("listitem").map(li => li.textContent)).toEqual(["客廳", "主臥"]);
    expect(within(list).getByText("2 間")).toBeInTheDocument();
    expect(within(list).getByText("Tina")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "管理" })).toHaveAttribute("href", `/MeowHQ/assets/floorplans/${H}`);
  });
  it("新增一戶時一起選平面圖：檔名當房名、可改名或移除，一次建立並逐張上傳，不換頁", async () => {
    let n = 0;
    mockFetch((url, init) => {
      if (url === "/api/hq/floorplans" && init?.method === "POST") return { status: 201, body: { ok: true, id: H } };
      if (url.endsWith("/rooms") && init?.method === "POST") {
        const b = JSON.parse(String(init.body));
        if ("roomId" in b) return { status: 201, body: { ok: true } };
        n += 1;
        return { body: { ok: true, roomId: `r${n}`, path: `floorplans/${H}/r${n}.png`, upload: { url: `https://blob/up${n}`, headers: {} } } };
      }
      if (url.startsWith("https://blob/up")) return {};
      return { body: { houses: [], storage: true } };
    });
    wrap(<FloorplanTab />);
    await screen.findByText(/還沒有任何一戶/);
    const button = screen.getByRole("button", { name: "建立並上傳" });
    fireEvent.change(screen.getByLabelText("戶名"), { target: { value: "阿明家" } });
    expect(button).toBeDisabled();  // 至少一張平面圖
    const files = [new File(["a"], "客廳.png", { type: "image/png" }), new File(["b"], "主臥.jpg", { type: "image/jpeg" }), new File(["c"], "x.pdf", { type: "application/pdf" })];
    fireEvent.change(screen.getByLabelText(/各房間平面圖/), { target: { files } });
    expect(screen.getByRole("alert")).toHaveTextContent("已略過不符合的檔案");
    const picked = screen.getByRole("list", { name: "已選的平面圖" });
    expect(within(picked).getByLabelText("第 1 張的房間名稱")).toHaveValue("客廳");
    fireEvent.change(within(picked).getByLabelText("第 2 張的房間名稱"), { target: { value: "主臥室" } });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByLabelText("戶名")).toHaveValue(""));
    const adds = calls.filter(c => c[1]?.method === "POST" && c[0].endsWith("/rooms")).map(c => JSON.parse(String(c[1]!.body))).filter(b => "roomId" in b);
    expect(adds.map(b => b.name)).toEqual(["客廳", "主臥室"]);
    expect(calls.filter(c => c[1]?.method === "PUT")).toHaveLength(2);
    expect(nav.push).not.toHaveBeenCalled();
  });
  it("中途有一張上傳失敗：說明已建立、哪一張失敗，留下沒傳的檔案", async () => {
    mockFetch((url, init) => {
      if (url === "/api/hq/floorplans" && init?.method === "POST") return { status: 201, body: { ok: true, id: H } };
      if (url.endsWith("/rooms")) return { status: 503, body: { error: "storage_disabled" } };
      return { body: { houses: [], storage: true } };
    });
    wrap(<FloorplanTab />);
    await screen.findByText(/還沒有任何一戶/);
    fireEvent.change(screen.getByLabelText("戶名"), { target: { value: "阿明家" } });
    fireEvent.change(screen.getByLabelText(/各房間平面圖/), { target: { files: [new File(["a"], "客廳.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: "建立並上傳" }));
    expect(await screen.findByText(/已建立「阿明家」，但第 1 張沒有上傳成功/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "已選的平面圖" })).getAllByRole("listitem")).toHaveLength(1);
  });
  it("卡片可刪除一戶，要再按一次確認", async () => {
    mockFetch((url, init) => init?.method === "DELETE" ? { body: { ok: true } } : { body: { houses: [summary({ createdBy: null, rooms: [], roomCount: 0 })], storage: true } });
    wrap(<FloorplanTab />);
    const list = await screen.findByRole("list", { name: "平面圖清單" });
    expect(within(list).getByText("—")).toBeInTheDocument();
    expect(within(list).getByText("還沒有平面圖")).toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: "刪除小美家" }));
    expect(calls.some(c => c[1]?.method === "DELETE")).toBe(false);
    fireEvent.click(within(list).getByRole("button", { name: "確認刪除" }));
    await waitFor(() => expect(calls.find(c => c[1]?.method === "DELETE")?.[0]).toBe(`/api/hq/floorplans/${H}`));
  });
  it("沒有資料時說明下一步；沒設定 Azure 時不顯示選檔並提醒", async () => {
    mockFetch(() => ({ body: { houses: [], storage: false } }));
    wrap(<FloorplanTab />);
    expect(await screen.findByText(/還沒有任何一戶/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("尚未設定 Azure Blob");
    expect(screen.queryByLabelText(/各房間平面圖/)).toBeNull();
  });
});

it("資料庫還沒更新（0014／0015）：直接說原因，不只顯示載入失敗", async () => {
  mockFetch(() => ({ status: 503, body: { error: "db_not_ready" } }));
  wrap(<FloorplanTab />);
  expect(await screen.findByText(/資料庫還沒更新/)).toBeInTheDocument();
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
    const input = await screen.findByLabelText("平面圖或室內照片（JPG 或 PNG，10 MB 以內）");
    fireEvent.change(input, { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("請選 JPG 或 PNG 圖片");
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

  it("AI 讀圖（PR 3）：失敗顯示原因並可重新讀圖；完成顯示讀到的牆、門窗、家具", async () => {
    const rooms = [
      { ...house().rooms[0], status: "failed" as const, error: "這張圖看起來不是平面圖，請換一張" },
      { ...house().rooms[1], status: "ready" as const, walls: [{ a: [0, 0], b: [4, 0], t: 0.15 }, { a: [4, 0], b: [4, 3], t: 0.15 }, { a: [4, 3], b: [0, 0], t: 0.15 }] as never,
        openings: [{ kind: "door" as const, wall: 0, at: 1, w: 0.9, h: 2.1 }], furniture: [], scale: { m_per_px: null, source: "estimate" as const } },
    ];
    mockFetch(() => ({ body: { house: house({ rooms }), storage: true } }));
    wrap(<FloorplanHouse id={H} />);
    const preview = await screen.findByRole("region", { name: "原圖預覽" });
    expect(within(preview).getByText("這張圖看起來不是平面圖，請換一張")).toBeInTheDocument();
    fireEvent.click(within(preview).getByRole("button", { name: "重新讀圖" }));
    await waitFor(() => expect(calls.some(([u, i]) => u === "/api/hq/rooms/floorplan/read" && i?.body === JSON.stringify({ houseId: H, roomId: "r1" }))).toBe(true));
    fireEvent.click(within(screen.getByRole("list", { name: "房間清單" })).getByRole("button", { name: /主臥/ }));
    expect(within(preview).getByText(/讀到 3 面牆、1 個門窗、0 件家具；\s*比例由 AI 推估/)).toBeInTheDocument();
  });

  it("讀圖中（剛開始）不顯示重新讀圖", async () => {
    const rooms = [{ ...house().rooms[0], status: "reading" as const, read_started_at: new Date().toISOString() }];
    mockFetch(() => ({ body: { house: house({ rooms }), storage: true } }));
    wrap(<FloorplanHouse id={H} />);
    const preview = await screen.findByRole("region", { name: "原圖預覽" });
    expect(within(preview).getByText(/AI 讀圖中/)).toBeInTheDocument();
    expect(within(preview).queryByRole("button", { name: /讀圖/ })).toBeNull();
  });

  it("其他角度照片（#144）：可移除；未滿 4 張可再加，走三步上傳；實景照片的結果註明是推估", async () => {
    const rooms = [{ ...house().rooms[0], status: "ready" as const, input: "photo" as const, walls: [], openings: [], furniture: [],
      scale: { m_per_px: null, source: "estimate" as const }, photoUrls: [{ path: `floorplans/${H}/r1_abc123.jpg`, url: "https://blob/r1_abc123.jpg?sas" }] }];
    mockFetch(url => url.endsWith("/photos") ? { body: { path: `floorplans/${H}/r1_def456.jpg`, upload: { url: "https://blob/put", headers: {} } } } : { body: { house: house({ rooms }), storage: true } });
    wrap(<FloorplanHouse id={H} />);
    const preview = await screen.findByRole("region", { name: "原圖預覽" });
    expect(within(preview).getByAltText("客廳的照片 2")).toBeInTheDocument();
    expect(within(preview).getByText(/依實景照片推估/)).toBeInTheDocument();
    fireEvent.change(within(preview).getByLabelText("加一張不同角度的室內照片（2／4）"), { target: { files: [new File(["x"], "b.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(within(preview).getByRole("button", { name: "加入" }));
    await waitFor(() => expect(calls.filter(([u]) => u.endsWith("/photos"))).toHaveLength(2));
    expect(calls.some(([u, i]) => u === "https://blob/put" && i?.method === "PUT")).toBe(true);
    fireEvent.click(within(preview).getByRole("button", { name: "移除" }));
    await waitFor(() => expect(calls.some(([u, i]) => u.endsWith("/photos") && i?.method === "DELETE")).toBe(true));
  });
});
