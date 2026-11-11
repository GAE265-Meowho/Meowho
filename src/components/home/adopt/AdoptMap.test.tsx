import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedCat } from "@/lib/adopt-feed";
import AdoptMap from "./AdoptMap";

afterEach(cleanup);

function cat(over: Partial<FeedCat> & Pick<FeedCat, "id" | "name" | "city" | "area">): FeedCat {
  return {
    sex: "公貓", stage: "成貓", district: `${over.city}${over.area}`, waitDays: 10, neutered: true,
    tags: [], diary: "", photo: null, filters: [], coat: null, home: null, ...over,
  };
}

const cats = [
  cat({ id: "橘子", name: "橘子", city: "台中市", area: "北屯區", coat: "橘白", tags: ["親人", "愛踩踏"], photo: "https://x/juzi.jpg" }),
  cat({ id: "黑糖", name: "黑糖", city: "台中市", area: "西屯區", coat: "黑白", tags: ["愛曬太陽", "獨立"] }),
  cat({ id: "灰灰", name: "灰灰", city: "台北市", area: "大安區", coat: "灰", tags: ["慢熟"] }),
];

describe("帶我回家地圖", () => {
  it("先選地區，中部看得到台中的貓，點了回到卡片", () => {
    const onShowCard = vi.fn();
    render(<AdoptMap cats={cats} onShowCard={onShowCard} />);
    expect(screen.getByRole("button", { name: /中部/ })).toHaveTextContent("2 隻在等家");
    expect(screen.getByRole("button", { name: /離島/ })).toHaveTextContent("澎湖、金門、連江");
    fireEvent.click(screen.getByRole("button", { name: /中部/ }));
    const orange = screen.getByRole("button", { name: /橘子，台中市北屯區/ });
    fireEvent.focus(orange);
    expect(screen.getByRole("tooltip")).toHaveTextContent("愛踩踏");
    expect(screen.getByRole("tooltip")).toHaveTextContent("台中市北屯區");
    expect(screen.queryByRole("button", { name: /灰灰/ })).toBeNull();
    fireEvent.click(orange);
    expect(onShowCard).toHaveBeenCalledWith("橘子");
  });

  it("手機先點開簡歷，再點同一隻才回到卡片", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    const onShowCard = vi.fn();
    render(<AdoptMap cats={cats} onShowCard={onShowCard} />);
    fireEvent.click(screen.getByRole("button", { name: /中部/ }));
    const orange = screen.getByRole("button", { name: /橘子，台中市北屯區/ });
    fireEvent.click(orange);
    expect(screen.getByRole("tooltip")).toHaveTextContent("橘子");
    expect(screen.getByRole("tooltip")).toHaveTextContent("愛踩踏");
    expect(onShowCard).not.toHaveBeenCalled();
    fireEvent.click(orange);
    expect(onShowCard).toHaveBeenCalledWith("橘子");
    vi.unstubAllGlobals();
  });

  it("附近有幾隻展開後可以收攏，貓咪在堆疊按鈕上面", () => {
    const onShowCard = vi.fn();
    const crowded = [
      cat({ id: "橘子", name: "橘子", city: "台中市", area: "北屯區", coat: "橘白", tags: ["愛踩踏"] }),
      cat({ id: "豆沙", name: "豆沙", city: "台中市", area: "北屯區", coat: "黑", tags: ["貪吃"] }),
    ];
    render(<AdoptMap cats={crowded} onShowCard={onShowCard} />);
    fireEvent.click(screen.getByRole("button", { name: /中部/ }));
    const pile = screen.getByRole("button", { name: "附近有 2 隻" });
    expect(screen.queryByRole("button", { name: /這區有/ })).toBeNull();
    fireEvent.click(pile);
    const orange = screen.getByRole("button", { name: /橘子/ });
    const fold = screen.getByRole("button", { name: /收攏/ });
    expect(Number(orange.style.zIndex)).toBeGreaterThan(Number(pile.style.zIndex || "0") || 3);
    expect(screen.getByRole("button", { name: /豆沙/ })).toBeInTheDocument();
    expect(onShowCard).not.toHaveBeenCalled();
    fireEvent.click(fold);
    expect(screen.getByRole("button", { name: "附近有 2 隻" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /橘子/ })).toBeNull();
  });

  it("沒有貓的地區仍進得去地圖", () => {
    render(<AdoptMap cats={cats} onShowCard={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /東部/ }));
    expect(screen.getByRole("status")).toHaveTextContent("這裡還沒有等家的貓");
    fireEvent.click(screen.getByRole("button", { name: "換地區" }));
    expect(screen.getByRole("button", { name: /北部/ })).toBeInTheDocument();
  });
});
