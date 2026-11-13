import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

async function load(url = "https://demo.supabase.co") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  return (await import("./SoundsTab")).SoundsTab;
}
beforeEach(() => { vi.unstubAllEnvs(); });

const rowOf = (id: string) => screen.getByText(id).closest("tr")!;

describe("虛擬體驗元件管理｜音效", () => {
  it("列出全部 35 個聲音，已上傳的可以試聽、看授權檔", async () => {
    const SoundsTab = await load();
    render(<SoundsTab />);
    expect(screen.getByText("已上傳 11 / 35 個；目前顯示 35 個")).toBeInTheDocument();
    const yowl = rowOf("sfx_yowl");
    expect(within(yowl).getByText("半夜發情大叫")).toBeInTheDocument();
    expect(within(yowl).getByText("第 5 份（渝茜）")).toBeInTheDocument();
    expect(within(yowl).getByLabelText("試聽：半夜發情大叫")).toHaveAttribute("src", "https://demo.supabase.co/storage/v1/object/public/meow-play-audio/sfx/sfx_yowl.mp3");
    expect(within(yowl).getByRole("link", { name: "授權檔" })).toHaveAttribute("href", "https://demo.supabase.co/storage/v1/object/public/meow-play-audio/sfx/sfx_yowl.license.txt");
    expect(within(rowOf("sfx_meow")).getByText("還沒有音檔")).toBeInTheDocument();
    expect(within(rowOf("bgm_daily")).getByText("自動切換")).toBeInTheDocument();
  });

  it("可以依分類篩選、只看已上傳", async () => {
    const SoundsTab = await load();
    render(<SoundsTab />);
    fireEvent.click(screen.getByRole("button", { name: "背景音樂" }));
    expect(screen.getByText("已上傳 11 / 35 個；目前顯示 5 個")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "貓的聲音" }));
    fireEvent.click(screen.getByLabelText("只看已上傳"));
    expect(screen.getByText("已上傳 11 / 35 個；目前顯示 3 個")).toBeInTheDocument();
    expect(screen.queryByText("sfx_meow")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "逗貓" }));
    expect(screen.getByText("這個分類還沒有上傳的音檔。")).toBeInTheDocument();
  });

  it("沒連資料庫時不放播放器", async () => {
    const SoundsTab = await load("");
    render(<SoundsTab />);
    expect(screen.queryByLabelText(/^試聽/)).toBeNull();
  });
});
