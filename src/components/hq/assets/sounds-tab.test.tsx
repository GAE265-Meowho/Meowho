import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const STORE = "https://demo.supabase.co/storage/v1/object/public/meow-play-audio";
// Storage 裡有的檔案（/api/play/sounds）：5 首背景音樂＋6 個音效
const FILES: Record<string, string> = {
  bgm_arrive: "1", bgm_daily: "1", bgm_night: "1", bgm_vet: "1", bgm_farewell: "1",
  sfx_pour_food: "2", sfx_pour_water: "2", sfx_scoop: "2", sfx_scream: "2", sfx_hiss: "2", sfx_yowl: "2",
};

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let files: Record<string, string> = {};
let uploadReply: { status: number; body: unknown } = { status: 200, body: { ok: true } };

async function load(url = "https://demo.supabase.co") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  calls = [];
  files = { ...FILES };
  vi.stubGlobal("fetch", vi.fn(async (u: string, init?: RequestInit) => {
    calls.push({ url: u, init });
    if (u === "/api/play/sounds") return new Response(JSON.stringify({ files }), { status: 200 });
    if (u === "/api/hq/sounds") {
      if (uploadReply.status === 200) files = { ...files, sfx_meow: "9" };
      return new Response(JSON.stringify(uploadReply.body), { status: uploadReply.status });
    }
    return new Response("{}", { status: 404 });
  }));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
  return (await import("./SoundsTab")).SoundsTab;
}
beforeEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); uploadReply = { status: 200, body: { ok: true } }; });

const rowOf = (id: string) => screen.getByText(id).closest("tr")!;
const mp3 = (name = "cat meow (1).mp3", size = 20_000) => new File([new Uint8Array(size)], name, { type: "audio/mpeg" });

describe("虛擬體驗元件管理｜音效", () => {
  it("有沒有音檔照 Storage 實際的檔案；已上傳的可以試聽、看授權檔", async () => {
    const SoundsTab = await load();
    render(<SoundsTab />);
    expect(await screen.findByText("已上傳 11 / 35 個；目前顯示 35 個")).toBeInTheDocument();
    const yowl = rowOf("sfx_yowl");
    expect(within(yowl).getByText("第 5 份（渝茜）")).toBeInTheDocument();
    expect(within(yowl).getByLabelText("試聽：半夜發情大叫")).toHaveAttribute("src", `${STORE}/sfx/sfx_yowl.mp3?v=2`);
    expect(within(yowl).getByRole("link", { name: "授權檔" })).toHaveAttribute("href", `${STORE}/sfx/sfx_yowl.license.txt?v=2`);
    expect(within(yowl).getByRole("button", { name: "換檔：半夜發情大叫" })).toBeInTheDocument();
    expect(within(rowOf("sfx_meow")).getByText("還沒有音檔")).toBeInTheDocument();
    expect(within(rowOf("sfx_meow")).getByRole("button", { name: "上傳：一般喵" })).toBeInTheDocument();
  });

  it("可以依分類篩選、只看已上傳", async () => {
    const SoundsTab = await load();
    render(<SoundsTab />);
    await screen.findByText("已上傳 11 / 35 個；目前顯示 35 個");
    fireEvent.click(screen.getByRole("button", { name: "背景音樂" }));
    expect(screen.getByText("已上傳 11 / 35 個；目前顯示 5 個")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "貓的聲音" }));
    fireEvent.click(screen.getByLabelText("只看已上傳"));
    expect(screen.getByText("已上傳 11 / 35 個；目前顯示 3 個")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "逗貓" }));
    expect(screen.getByText("這個分類還沒有上傳的音檔。")).toBeInTheDocument();
  });

  it("可以依「誰呼叫」篩選，並和分類、只看已上傳一起用（#399）", async () => {
    const SoundsTab = await load();
    render(<SoundsTab />);
    await screen.findByText("已上傳 11 / 35 個；目前顯示 35 個");
    const who = screen.getByLabelText("誰呼叫");
    fireEvent.change(who, { target: { value: "Tina" } });
    expect(screen.getByText("已上傳 11 / 35 個；目前顯示 10 個")).toBeInTheDocument();
    expect(screen.getByText("sfx_clip")).toBeInTheDocument();
    expect(screen.queryByText("sfx_yowl")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("只看已上傳"));
    expect(screen.getByText("已上傳 11 / 35 個；目前顯示 2 個")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "逗貓" }));
    expect(screen.getByText("沒有符合條件的音效。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    fireEvent.click(screen.getByLabelText("只看已上傳"));
    fireEvent.change(who, { target: { value: "自動切換" } });
    expect(screen.getByText("已上傳 11 / 35 個；目前顯示 5 個")).toBeInTheDocument();
    fireEvent.change(who, { target: { value: "all" } });
    expect(screen.getByText("已上傳 11 / 35 個；目前顯示 35 個")).toBeInTheDocument();
  });

  it("新增音效：選音效、挑檔案，顯示上傳後的檔名，送出後清單更新", async () => {
    const SoundsTab = await load();
    render(<SoundsTab />);
    await screen.findByText("已上傳 11 / 35 個；目前顯示 35 個");
    fireEvent.click(screen.getByRole("button", { name: "新增音效" }));
    const form = screen.getByRole("form", { name: "新增音效" });
    fireEvent.change(within(form).getByLabelText("要放到哪個音效＊"), { target: { value: "sfx_meow" } });
    expect(within(form).getByText("用在：貓回應、需求氣泡出現")).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText(/音檔（\.mp3/), { target: { files: [mp3()] } });
    expect(within(form).getByText(/上傳後會改名為/)).toHaveTextContent("cat meow (1).mp3（20 KB）上傳後會改名為 sfx/sfx_meow.mp3");
    fireEvent.change(within(form).getByLabelText("來源＊"), { target: { value: "https://pixabay.com/sound-effects/x/" } });
    await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "上傳" })); });

    const post = calls.find(c => c.url === "/api/hq/sounds")!;
    const body = post.init!.body as FormData;
    expect(body.get("id")).toBe("sfx_meow");
    expect(body.get("license")).toBe("Pixabay Content License");
    expect((body.get("file") as File).name).toBe("cat meow (1).mp3");
    expect(await screen.findByRole("status")).toHaveTextContent("已上傳「一般喵」（sfx/sfx_meow.mp3）");
    await waitFor(() => expect(screen.getByText("已上傳 12 / 35 個；目前顯示 35 個")).toBeInTheDocument());
    expect(screen.queryByRole("form", { name: "新增音效" })).toBeNull();
  });

  it("從某一列按「換檔」會先選好那個音效，並提醒會取代舊檔", async () => {
    const SoundsTab = await load();
    render(<SoundsTab />);
    await screen.findByText("已上傳 11 / 35 個；目前顯示 35 個");
    fireEvent.click(within(rowOf("sfx_hiss")).getByRole("button", { name: "換檔：哈氣" }));
    const form = screen.getByRole("form", { name: "新增音效" });
    expect(within(form).getByLabelText("要放到哪個音效＊")).toHaveValue("sfx_hiss");
    expect(within(form).getByText("這個音效已經有檔案，上傳後會取代舊的")).toBeInTheDocument();
  });

  it("沒填完、檔案不對，在送出前就擋下；伺服器拒絕時顯示原因", async () => {
    const SoundsTab = await load();
    render(<SoundsTab />);
    await screen.findByText("已上傳 11 / 35 個；目前顯示 35 個");
    fireEvent.click(screen.getByRole("button", { name: "新增音效" }));
    const form = screen.getByRole("form", { name: "新增音效" });
    fireEvent.click(within(form).getByRole("button", { name: "上傳" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("檔案是空的");
    fireEvent.change(within(form).getByLabelText("要放到哪個音效＊"), { target: { value: "sfx_meow" } });
    fireEvent.change(within(form).getByLabelText(/音檔（\.mp3/), { target: { files: [new File(["x"], "a.wav", { type: "audio/wav" })] } });
    fireEvent.click(within(form).getByRole("button", { name: "上傳" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("只能上傳 .mp3 檔");
    fireEvent.change(within(form).getByLabelText(/音檔（\.mp3/), { target: { files: [mp3()] } });
    fireEvent.click(within(form).getByRole("button", { name: "上傳" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("請填來源");
    expect(calls.some(c => c.url === "/api/hq/sounds")).toBe(false);

    uploadReply = { status: 403, body: { error: "permission_denied" } };
    fireEvent.change(within(form).getByLabelText("來源＊"), { target: { value: "自錄" } });
    await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "上傳" })); });
    expect(within(form).getByRole("alert")).toHaveTextContent("你沒有虛擬體驗元件管理的權限");
  });

  it("沒連資料庫時不放播放器", async () => {
    const SoundsTab = await load("");
    render(<SoundsTab />);
    await screen.findByText(/^已上傳 \d+ \/ 35 個/);
    expect(screen.queryByLabelText(/^試聽/)).toBeNull();
  });
});
