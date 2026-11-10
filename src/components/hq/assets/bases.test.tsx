// 3D 貓咪體型預覽（#302）：大貓｜成貓｜幼貓三分頁，每頁都有播放與畫面、動作、貓咪資訊
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BasesPage } from "./BasesPage";

const preview = vi.hoisted(() => ({ last: {} as Record<string, unknown> }));
vi.mock("./CatPreview", () => ({
  default: function FakePreview(props: Record<string, unknown>) {
    preview.last = props;
    const onInfo = props.onInfo as ((i: unknown) => void) | undefined;
    const url = String(props.baseUrl);
    useEffect(() => {
      // 大貓沒有眼球與眨眼形狀鍵，只有待機、走路
      onInfo?.(url.includes("runner")
        ? { clips: ["run", "groom"], eyes: 0, bones: 27, morphs: [] }
        : url.includes("large")
        ? { clips: ["idle", "walk"], eyes: 0, bones: 39, morphs: [] }
        : { clips: ["idle", "walk", "sleep", "sit"], eyes: 2, bones: 39, morphs: ["blink_L", "blink_R"] });
    }, [onInfo, url]);
    return <div data-testid="fake-preview" />;
  },
}));
const nav = vi.hoisted(() => ({ query: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => "/MeowHQ/assets/bases",
  useSearchParams: () => new URLSearchParams(nav.query),
}));

beforeEach(() => { nav.query = ""; nav.replace.mockReset(); preview.last = {}; });
afterEach(() => cleanup());

const groups = () => Array.from(screen.getByRole("region", { name: "參數" }).querySelectorAll(":scope > details > summary")).map(s => s.textContent);

describe("3D 貓咪體型預覽（#302）", () => {
  it("分頁依序為大貓、成貓、幼貓、奔跑貓，預設大貓", async () => {
    render(<BasesPage />);
    expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["大貓", "成貓", "幼貓", "奔跑貓"]);
    expect(screen.getByRole("tab", { name: "大貓" })).toHaveAttribute("aria-selected", "true");
    await screen.findByTestId("fake-preview");
    expect(preview.last.baseUrl).toBe("/hq-cat-models/base/base_clips_large.glb");
  });

  it("切換分頁寫進網址 ?body=", () => {
    render(<BasesPage />);
    fireEvent.click(screen.getByRole("tab", { name: "幼貓" }));
    expect(nav.replace).toHaveBeenCalledWith("/MeowHQ/assets/bases?body=kitten", { scroll: false });
  });

  it("大貓：有播放與畫面、動作、貓咪資訊；沒有眼球時不顯示眼睛參數與眨眼", async () => {
    render(<BasesPage />);
    await screen.findByTestId("fake-preview");
    await act(async () => {});
    expect(groups()).toEqual(["播放與畫面", "動作", "貓咪資訊"]);
    const panel = screen.getByRole("region", { name: "參數" });
    expect(within(panel).queryByRole("slider", { name: /眨眼/ })).toBeNull();
    expect(within(panel).getByRole("button", { name: "重設視角" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "走路" })).toBeEnabled();
    expect(within(panel).getByRole("link", { name: "下載 GLB" })).toHaveAttribute("href", "/hq-cat-models/base/base_clips_large.glb");
  });

  it("大貓的貓咪資訊放原始參考模型照片與 CC-BY 來源", async () => {
    render(<BasesPage />);
    await screen.findByTestId("fake-preview");
    expect(screen.getByRole("img", { name: "大貓參考模型側面" })).toHaveAttribute("src", "/hq-cat-models/base/large_ref_side.jpg");
    expect(screen.getByRole("img", { name: "大貓參考模型斜前方" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cat in Motion 3d model free" })).toHaveAttribute("href", expect.stringContaining("sketchfab.com"));
    expect(screen.getByText(/CC-BY 4\.0/)).toBeInTheDocument();
    expect(screen.getByText("尚未用於貓咪製作")).toBeInTheDocument();
  });

  it("成貓分頁：沿用母體 API，有眼睛參數，貓咪資訊標示自動套用、沒有參考照片", async () => {
    nav.query = "body=adult";
    render(<BasesPage />);
    await screen.findByTestId("fake-preview");
    await act(async () => {});
    expect(preview.last.baseUrl).toBe("/api/hq/cat-models/base");
    expect(groups()).toEqual(["播放與畫面", "動作", "眼睛", "貓咪資訊"]);
    expect(screen.getByText("系統依年齡自動套用")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("奔跑貓分頁（#331）：載入 runner glb，可播奔跑，沒有眼睛參數，貓咪資訊有參考照片", async () => {
    nav.query = "body=runner";
    render(<BasesPage />);
    await screen.findByTestId("fake-preview");
    await act(async () => {});
    expect(preview.last.baseUrl).toBe("/hq-cat-models/base/cat_runner_tabby.glb");
    expect(groups()).toEqual(["播放與畫面", "動作", "貓咪資訊"]);
    expect(screen.getByRole("button", { name: "奔跑" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "理毛" })).toBeEnabled();
    expect(screen.getByRole("img", { name: "奔跑貓側面" })).toBeInTheDocument();
  });
});
