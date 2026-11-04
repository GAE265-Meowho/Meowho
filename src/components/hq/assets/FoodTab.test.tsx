import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FoodTab } from "./FoodTab";
import { FOOD_PRODUCTS } from "@/lib/hq/food/catalog";
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
afterEach(cleanup);
describe("後台食物元件", () => {
  it("產品類型與年齡可交叉篩選，清除後回到完整目錄", () => {
    render(<FoodTab />);
    expect(screen.getByText(`${FOOD_PRODUCTS.length} 項產品`)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "乾糧" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "幼貓" }));
    const expected = FOOD_PRODUCTS.filter(p => p.category === "dry" && p.ages.includes("kitten"));
    expect(screen.getAllByRole("article")).toHaveLength(expected.length);
    fireEvent.click(screen.getByRole("button", { name: "清除篩選" }));
    expect(screen.getAllByRole("article")).toHaveLength(FOOD_PRODUCTS.length);
  });
  it("搜尋可以找指定商品，詳細資訊是安全的官方外連", () => {
    render(<FoodTab />);
    fireEvent.change(screen.getByRole("textbox", { name: "搜尋產品" }), { target: { value: "K36 幼貓專用乾糧" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    const official = screen.getByRole("link", { name: /官方詳細資訊/ });
    expect(official.getAttribute("href")).toBe("https://www.royalcanin.com/tw/cats/products/retail-products/kitten-2522");
    expect(official.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("TWD 853")).toBeTruthy();
  });
});
