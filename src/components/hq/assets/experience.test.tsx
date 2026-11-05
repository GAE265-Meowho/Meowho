// 虛擬體驗（#150）：選虛擬貓、選喵戶，把貓放進 3D 室內空間（3D 換成替身，不需要 WebGL）
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceTab } from "./ExperienceTab";

const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams("tab=experience") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, refresh: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => "/MeowHQ/assets",
}));
const viewer = vi.hoisted(() => ({
  last: null as null | {
    rooms: { id: string }[];
    cat: { body: string; albedoUrl: string; baseUrl: string } | null;
    onFloorDrop?: (itemId: string, at: { roomId: string; x: number; z: number; y: number; support: null }) => void;
    onMoveItem?: (key: string, at: { x: number; z: number; y: number; support: null }) => void;
    onRemoveItem?: (key: string) => void;
    onPlace?: unknown;
    placeMode?: boolean;
    interactMode?: "point" | "hand";
    placedItems?: { key: string; name: string; x: number; z: number; y: number }[];
  },
}));
vi.mock("./FloorplanViewer", () => ({
  default: function FakeViewer(props: typeof viewer.last & object) { viewer.last = props; return <div data-testid="fake-viewer" />; },
}));
vi.mock("./ItemGlbThumb", () => ({
  ItemGlbThumb: () => <span data-testid="item-thumb" />,
}));

const confirmed = { state: "confirmed", preview: "albedo", previewBody: "adult" };
const cat = (id: string, name: string, texture: unknown = confirmed) => ({ id, name, body: "adult", texture, hasAlbedo: true, albedoVersion: "v1", variantStorage: false });
const H1 = "room_20261102_220000", H2 = "room_20261103_010000";
const summary = (id: string, name: string, status = "ready") => ({ id, name, roomCount: 1, updatedAt: "x", createdBy: "子哲", rooms: [{ id: "r1", name: "客廳", status, imageUrl: null }] });
const house = (id: string, name: string) => ({ id, name, updatedAt: "x", rooms: [{ id: "r1", name: "客廳", image_path: "x", status: "ready", created_at: "x", imageUrl: null, photoUrls: [], walls: [] }] });
const categories = [{ id: "litter_box", name: "貓砂盆", sortOrder: 1 }, { id: "toys", name: "玩具", sortOrder: 2 }];
const items = [
  {
    id: "i1", name: "開放式貓砂盆", nameEn: null, categoryId: "litter_box", categoryName: "貓砂盆",
    priceTwd: 100, instructions: null, modelPath: "a/model.glb", modelUrl: "https://example/a.glb",
    widthM: 0.5, depthM: 0.4, heightM: 0.3, createdAt: "2026-11-04T00:00:00Z",
  },
  {
    id: "i2", name: "逗貓棒", nameEn: null, categoryId: "toys", categoryName: "玩具",
    priceTwd: 50, instructions: null, modelPath: "b/model.glb", modelUrl: "https://example/b.glb",
    widthM: 0.2, depthM: 0.2, heightM: 0.4, createdAt: "2026-11-04T00:00:00Z",
  },
];

let calls: string[];
function mockFetch(cats: unknown[], houses: unknown[]) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    if (url.startsWith("/api/hq/cat-models")) return { ok: true, status: 200, json: async () => ({ cats }) };
    if (url === "/api/hq/floorplans") return { ok: true, status: 200, json: async () => ({ houses, storage: true }) };
    if (url === "/api/hq/items/categories") return { ok: true, status: 200, json: async () => ({ categories }) };
    if (url === "/api/hq/items") return { ok: true, status: 200, json: async () => ({ items }) };
    return { ok: true, status: 200, json: async () => ({ house: house(url.split("/").pop()!, url.endsWith(H2) ? "測試之家" : "子哲的家") }) };
  }));
}

beforeEach(() => { nav.replace.mockReset(); nav.params = new URLSearchParams("tab=experience"); viewer.last = null; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("虛擬體驗（#150）", () => {
  it("只列出有確認貼圖的貓、有讀圖完成房間的喵戶；預設各選第一個，貓放進那戶的 3D", async () => {
    mockFetch(
      [cat("cat_1", "橘寶 Mango"), cat("cat_2", "還沒貼圖", { state: "none", preview: null, previewBody: "adult" })],
      [summary(H1, "子哲的家"), summary(H2, "還在讀圖", "reading")],
    );
    render(<ExperienceTab />);
    const catSelect = await screen.findByLabelText("虛擬貓");
    expect(within(catSelect).getAllByRole("option").map(o => o.textContent)).toEqual(["橘寶 Mango"]);
    expect(within(screen.getByLabelText("喵戶")).getAllByRole("option").map(o => o.textContent)).toEqual(["子哲的家"]);
    expect(await screen.findByTestId("fake-viewer")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "橘寶 Mango 在 子哲的家" })).toBeInTheDocument();
    expect(viewer.last?.cat).toMatchObject({ body: "adult", baseUrl: "/api/hq/cat-models/base" });
    expect(viewer.last?.cat?.albedoUrl).toContain("cat_1");
  });

  it("換貓、換喵戶寫進網址；網址指定的會被選上", async () => {
    nav.params = new URLSearchParams(`tab=experience&house=${H2}`);
    mockFetch([cat("cat_1", "橘寶 Mango"), cat("cat_3", "小黑")], [summary(H1, "子哲的家"), summary(H2, "測試之家")]);
    render(<ExperienceTab />);
    const houseSelect = await screen.findByLabelText("喵戶");
    expect(houseSelect).toHaveValue(H2);
    await waitFor(() => expect(calls).toContain(`/api/hq/floorplans/${H2}`));
    fireEvent.change(screen.getByLabelText("虛擬貓"), { target: { value: "cat_3" } });
    expect(nav.replace).toHaveBeenCalledWith(`/MeowHQ/assets?tab=experience&house=${H2}&cat=cat_3`, { scroll: false });
  });

  it("沒有可用的貓或喵戶：說明並連到貓咪製作／平面圖轉換", async () => {
    mockFetch([], []);
    render(<ExperienceTab />);
    expect(await screen.findByRole("link", { name: "到貓咪製作" })).toHaveAttribute("href", "/MeowHQ/assets");
    expect(screen.getByRole("link", { name: "到平面圖轉換" })).toHaveAttribute("href", "/MeowHQ/assets?tab=rooms-floorplan");
    expect(screen.getByText("選好虛擬貓和喵戶後，貓會出現在房間裡")).toBeInTheDocument();
  });

  it("右側有用品選單，可依類別篩選；拖放會把用品放進場景；點選不會開放置模式", async () => {
    mockFetch([cat("cat_1", "橘寶 Mango")], [summary(H1, "子哲的家")]);
    render(<ExperienceTab />);
    const palette = await screen.findByRole("complementary", { name: "生活用品選單" });
    expect(within(palette).getByText("開放式貓砂盆")).toBeInTheDocument();
    expect(within(palette).getByText("逗貓棒")).toBeInTheDocument();
    expect(within(palette).getAllByTestId("item-thumb")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "玩具" }));
    expect(within(palette).queryByText("開放式貓砂盆")).toBeNull();
    expect(within(palette).getByText("逗貓棒")).toBeInTheDocument();
    await waitFor(() => expect(viewer.last?.onFloorDrop).toBeTypeOf("function"));
    expect(viewer.last?.onPlace).toBeUndefined();
    expect(viewer.last?.interactMode).toBe("point");
    expect(screen.getByRole("button", { name: "點" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "手掌" }));
    await waitFor(() => expect(viewer.last?.interactMode).toBe("hand"));
    viewer.last!.onFloorDrop!("i2", { roomId: "r1", x: 1.2, z: 0.8, y: 0, support: null });
    await waitFor(() => expect(viewer.last?.placedItems?.some(p => p.name === "逗貓棒" && p.x === 1.2 && p.z === 0.8 && p.y === 0)).toBe(true));
    const key = viewer.last!.placedItems!.find(p => p.name === "逗貓棒")!.key;
    expect(viewer.last?.onRemoveItem).toBeTypeOf("function");
    viewer.last!.onRemoveItem!(key);
    await waitFor(() => expect(viewer.last?.placedItems?.some(p => p.key === key)).toBe(false));
  });
});
