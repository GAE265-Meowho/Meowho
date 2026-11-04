// MeowHQ 外殼互動元件測試：UT-HQ-13（登入頁）、42、43、46、47、48（docs/hq/02）
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HqShell } from "./HqShell";
import { HqEmptyState, HqNoResults, HqOfflineBanner, HqSaveButton } from "./HqStates";
import { HqToastProvider, useHqToast } from "./HqToast";
import { HqLoginPage } from "./HqLoginPage";

let search = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));

afterEach(() => { cleanup(); vi.useRealTimers(); });

const shell = (extra = {}) => (
  <HqShell items={["home", "user_management", "admin_authorization"]} user={{ name: "Tina", roleLabel: "系統管理員" }} unread={3} onLogout={() => {}} activePath="/MeowHQ" {...extra}>
    <p>內容</p>
  </HqShell>
);

describe("UT-HQ-13 登入頁", () => {
  it("按下 Google 登入會帶著目前網址", () => {
    const login = vi.fn();
    render(<HqLoginPage onLogin={login} next="/MeowHQ/users" />);
    fireEvent.click(screen.getByRole("button", { name: /Google/ }));
    expect(login).toHaveBeenCalledWith("/MeowHQ/users");
  });
  it("#116 依 Stitch：左上角喵戶 logo＋「總部」與標語、卡片標題「進入總部」，沒有不存在的政策連結", () => {
    render(<HqLoginPage onLogin={() => {}} next="/MeowHQ" />);
    expect(screen.getByText("總部")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Meowho喵戶" })).toHaveLength(2); // 左上角圓形 logo＋卡片字標
    expect(screen.getByText("AI喵寶生態系")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "使用 Google 登入" })).toBeInTheDocument();
    expect(screen.queryByText(/註冊/)).toBeNull(); // 後台只能登入、不能註冊
    expect(screen.getByRole("heading", { level: 2, name: /讓每隻貓都找到.*好的人類/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "進入總部" })).toBeInTheDocument();
    expect(screen.queryByText(/隱私權政策|安全規範/)).toBeNull();
    expect(document.querySelector(".hq-login-mark")).toHaveAttribute("src", "/logos/logo-round.jpg"); // 左上角用喵戶圓形 logo
  });
});

describe("UT-HQ-42 手機選單", () => {
  it("☰ 切換側欄與 aria-expanded", () => {
    render(shell());
    const btn = screen.getByRole("button", { name: "選單" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("hq-sidebar")).toHaveClass("open");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });
  it("只顯示傳入的項目，依 Stitch 分組並附圖示（#113）；沒有項目的分組不顯示", () => {
    render(shell());
    const nav = screen.getByRole("navigation", { name: "後台導覽" });
    expect(nav).not.toHaveTextContent("商品");
    const groups = Array.from(nav.querySelectorAll(".hq-navgroup")).map(g => g.textContent);
    expect(groups).toEqual(["營運與社群", "系統"]);
    const links = Array.from(nav.querySelectorAll("a")).map(a => a.textContent);
    expect(links).toEqual(["首頁", "用戶權限管理", "Admin 授權"]);
    for (const a of nav.querySelectorAll("a")) expect(a.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("link", { name: "首頁" })).toHaveAttribute("aria-current", "page");
  });
  it("#179 貓戶管理排在「營運與社群」第一個，連到 /MeowHQ/households", () => {
    render(shell({ items: ["home", "households", "user_management"], activePath: "/MeowHQ/households" }));
    const nav = screen.getByRole("navigation", { name: "後台導覽" });
    expect(Array.from(nav.querySelectorAll("a")).map(a => a.textContent)).toEqual(["首頁", "貓戶管理", "用戶權限管理"]);
    const link = screen.getByRole("link", { name: "貓戶管理" });
    expect(link).toHaveAttribute("href", "/MeowHQ/households");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});

describe("#113 虛擬體驗元件管理分組", () => {
  const assets = (activePath: string) => (
    <HqShell items={["home", "virtual_assets"]} user={{ name: "Tina", roleLabel: "系統管理員" }} unread={0} onLogout={() => {}} activePath={activePath}>
      <p>內容</p>
    </HqShell>
  );
  afterEach(() => { search = ""; });
  it("「虛擬體驗元件管理」可收合（#183）：不在模組內時預設收合，按標題展開六個區塊（含 #150 虛擬體驗）、各有線條圖示；寶麗來、平面圖轉換不在選單（在室內空間頁）", () => {
    render(assets("/MeowHQ"));
    const toggle = screen.getByRole("button", { name: "虛擬體驗元件管理" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "貓咪製作" })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const group = screen.getByRole("list", { name: "虛擬體驗元件管理" });
    const links = Array.from(group.querySelectorAll("a")).map(a => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["貓咪製作", "/MeowHQ/assets"],
      ["室內空間", "/MeowHQ/assets?tab=rooms"],
      ["飼料", "/MeowHQ/assets?tab=food"],
      ["生活用品", "/MeowHQ/assets?tab=items"],
      ["其他", "/MeowHQ/assets?tab=others"],
      ["虛擬體驗", "/MeowHQ/assets?tab=experience"],
    ]);
    for (const a of group.querySelectorAll("a")) expect(a.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText("虛擬與科技體驗")).toBeNull();
    expect(screen.queryByText("寶麗來轉換")).toBeNull();
  });
  it("在模組內時自動展開（#183），再按標題可收合", () => {
    render(assets("/MeowHQ/assets"));
    const toggle = screen.getByRole("button", { name: "虛擬體驗元件管理" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(screen.queryByRole("link", { name: "貓咪製作" })).toBeNull();
  });
  it("目前區塊標示 aria-current；室內空間的子頁算室內空間，貓咪子頁算貓咪製作", () => {
    search = "tab=rooms-polaroid";
    const { unmount } = render(assets("/MeowHQ/assets"));
    expect(screen.getByRole("link", { name: "室內空間" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "貓咪製作" })).not.toHaveAttribute("aria-current");
    unmount();
    search = "";
    const cats = render(assets("/MeowHQ/assets/cats/new"));
    expect(screen.getByRole("link", { name: "貓咪製作" })).toHaveAttribute("aria-current", "page");
    cats.unmount();
    // #138：平面圖的戶算室內空間
    render(assets("/MeowHQ/assets/floorplans/room_20261102_220000"));
    expect(screen.getByRole("link", { name: "室內空間" })).toHaveAttribute("aria-current", "page");
  });
  it("沒有虛擬體驗元件管理權限就不顯示這個分組", () => {
    render(shell());
    expect(screen.queryByRole("list", { name: "虛擬體驗元件管理" })).toBeNull();
  });
});

describe("UT-HQ-43 頂列", () => {
  it("鈴鐺含未讀數、頭像選單含登出", () => {
    const logout = vi.fn();
    render(shell({ onLogout: logout }));
    expect(screen.getByRole("button", { name: /通知.*3/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "管理者介面首頁" })).toBeInTheDocument();
    expect(screen.getByText("管理者介面")).toBeInTheDocument();
    expect(screen.getByText("Administrator Interface")).toBeInTheDocument();
    const avatar = screen.getByRole("button", { name: "帳號選單" });
    expect(screen.queryByRole("menuitem", { name: "登出" })).toBeNull();
    fireEvent.click(avatar);
    expect(screen.getByText("系統管理員")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "登出" }));
    expect(logout).toHaveBeenCalled();
  });
});

describe("UT-HQ-46 空白 vs 篩選無結果", () => {
  it("空白：睡貓插圖＋下一步按鈕", () => {
    render(<HqEmptyState message="目前沒有待審的中途認證" actionLabel="回待辦總覽" onAction={() => {}} />);
    expect(screen.getByRole("img", { name: "睡著的貓" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回待辦總覽" })).toBeInTheDocument();
  });
  it("篩選無結果：只有文字與清除篩選，沒有插圖", () => {
    const clear = vi.fn();
    render(<HqNoResults onClear={clear} />);
    expect(screen.getByText("沒有符合條件的資料")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "清除篩選" }));
    expect(clear).toHaveBeenCalled();
  });
});

describe("UT-HQ-47 成功提示", () => {
  function Trigger() {
    const { show } = useHqToast();
    return <button onClick={() => show({ message: "已停權 小花", logHref: "/MeowHQ/admin" })}>go</button>;
  }
  it("約 4 秒後消失，含查看紀錄連結", () => {
    vi.useFakeTimers();
    render(<HqToastProvider><Trigger /></HqToastProvider>);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByRole("status")).toHaveTextContent("已停權 小花");
    expect(screen.getByRole("link", { name: "查看紀錄" })).toHaveAttribute("href", "/MeowHQ/admin");
    act(() => { vi.advanceTimersByTime(3900); });
    expect(screen.getByRole("status")).toHaveTextContent("已停權 小花");
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText("已停權 小花")).toBeNull();
  });
});

describe("UT-HQ-48 儲存失敗", () => {
  it("表單內容保留，按鈕旁顯示白話錯誤", async () => {
    const onSave = vi.fn().mockRejectedValue(Object.assign(new Error("fetch failed"), { code: "network" }));
    render(<div><input aria-label="原因" defaultValue="詐騙" /><HqSaveButton onSave={onSave}>儲存</HqSaveButton></div>);
    fireEvent.change(screen.getByLabelText("原因"), { target: { value: "詐騙：多筆" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "儲存" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("網路中斷，請再試一次");
    expect(screen.getByRole("alert")).not.toHaveTextContent("network");
    expect(screen.getByLabelText("原因")).toHaveValue("詐騙：多筆");
  });
  it("離線時橫幅出現、儲存停用", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<div><HqOfflineBanner /><HqSaveButton onSave={async () => {}}>儲存</HqSaveButton></div>);
    expect(screen.getByRole("status")).toHaveTextContent("目前離線，恢復連線後會自動更新");
    expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled();
  });
});
