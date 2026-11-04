import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItemsTab } from "./ItemsTab";

vi.mock("@/lib/supabase/client", () => ({ getBrowserSupabase: () => null }));
vi.mock("@/lib/hq/items/glb-bounds", () => ({
  measureGlbFile: async () => ({ widthM: 0.5, depthM: 0.4, heightM: 0.35, scale: 1, warning: null }),
}));
vi.mock("next/dynamic", () => ({
  default: () => () => <div>3D 預覽</div>,
}));

const categories = [{ id: "litter_box", name: "貓砂盆", sortOrder: 1 }, { id: "toys", name: "玩具", sortOrder: 3 }];
const items = [{
  id: "i1", name: "貓砂盆", nameEn: "Litter Box", categoryId: "litter_box", categoryName: "貓砂盆",
  priceTwd: 1127, instructions: null, modelPath: "a/model.glb", modelUrl: "https://example/a/model.glb",
  widthM: 0.5, depthM: 0.4, heightM: 0.35, createdAt: "2026-11-04T00:00:00Z",
}];

afterEach(cleanup);

describe("ItemsTab", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/categories")) return Response.json({ categories });
      return Response.json({ items });
    }));
  });

  it("列出用品並可用類別篩選", async () => {
    render(<ItemsTab />);
    await waitFor(() => expect(screen.getByText("1 件用品")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "貓砂盆" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "玩具" }));
    expect(screen.getByText("0 件用品")).toBeTruthy();
    expect(screen.getByText(/還沒有符合條件的生活用品/)).toBeTruthy();
  });
});
