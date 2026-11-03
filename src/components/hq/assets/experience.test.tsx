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
const viewer = vi.hoisted(() => ({ last: null as null | { rooms: { id: string }[]; cat: { body: string; albedoUrl: string; baseUrl: string } | null } }));
vi.mock("./FloorplanViewer", () => ({
  default: function FakeViewer(props: typeof viewer.last & object) { viewer.last = props; return <div data-testid="fake-viewer" />; },
}));

const confirmed = { state: "confirmed", preview: "albedo", previewBody: "adult" };
const cat = (id: string, name: string, texture: unknown = confirmed) => ({ id, name, body: "adult", texture, hasAlbedo: true, albedoVersion: "v1", variantStorage: false });
const H1 = "room_20261102_220000", H2 = "room_20261103_010000";
const summary = (id: string, name: string, status = "ready") => ({ id, name, roomCount: 1, updatedAt: "x", createdBy: "子哲", rooms: [{ id: "r1", name: "客廳", status, imageUrl: null }] });
const house = (id: string, name: string) => ({ id, name, updatedAt: "x", rooms: [{ id: "r1", name: "客廳", image_path: "x", status: "ready", created_at: "x", imageUrl: null, photoUrls: [], walls: [] }] });

let calls: string[];
function mockFetch(cats: unknown[], houses: unknown[]) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    const body = url.startsWith("/api/hq/cat-models") ? { cats }
      : url === "/api/hq/floorplans" ? { houses, storage: true }
        : { house: house(url.split("/").pop()!, url.endsWith(H2) ? "測試之家" : "子哲的家") };
    return { ok: true, status: 200, json: async () => body };
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
});
