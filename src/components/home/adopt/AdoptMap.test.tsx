import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedCat } from "@/lib/adopt-feed";
import AdoptMap from "./AdoptMap";

afterEach(cleanup);

function cat(over: Partial<FeedCat> & Pick<FeedCat, "id" | "name" | "city" | "area">): FeedCat {
  return {
    sex: "公貓", stage: "成貓", district: `${over.city}${over.area}`, waitDays: 10, neutered: true,
    tags: [], diary: "", photo: null, filters: [], coat: null,
    home: { id: over.id, name: `${over.name}的喵戶`, intro: "", foster: "" },
    ...over,
  };
}

const shared = { id: "beitun", name: "小晴的中途貓屋", intro: "", foster: "個人中途" };

const cats = [
  cat({ id: "橘子", name: "橘子", city: "台中市", area: "北屯區", coat: "橘白", tags: ["親人", "愛踩踏"], photo: "https://x/juzi.jpg", home: shared }),
  cat({ id: "豆沙", name: "豆沙", city: "台中市", area: "北屯區", coat: "黑", tags: ["貪吃"], home: shared }),
  cat({ id: "灰灰", name: "灰灰", city: "台北市", area: "大安區", coat: "灰", tags: ["慢熟"], home: { id: "daan", name: "大安海苔家", intro: "", foster: "" } }),
];

describe("帶我回家地圖", () => {
  it("全島同一張地圖，點喵戶列出貓，再點貓回到卡片", () => {
    const onShowCard = vi.fn();
    render(<AdoptMap cats={cats} matches={() => true} onShowCard={onShowCard} initialCity={null} />);
    expect(screen.queryByRole("button", { name: /中部/ })).toBeNull();
    expect(screen.getByRole("button", { name: "放大地圖" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /小晴的中途貓屋/ })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /大安海苔家/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /小晴的中途貓屋/ }));
    expect(screen.getByRole("dialog", { name: "小晴的中途貓屋" })).toHaveTextContent("橘子");
    expect(screen.getByRole("dialog")).toHaveTextContent("豆沙");
    fireEvent.click(screen.getByRole("button", { name: /橘子/ }));
    expect(onShowCard).toHaveBeenCalledWith("橘子");
  });

  it("沒有喵戶時說明目前沒有等家的貓", () => {
    render(<AdoptMap cats={[]} matches={() => true} onShowCard={() => {}} initialCity={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("這裡還沒有等家的貓");
  });
});