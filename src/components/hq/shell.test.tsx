// MeowHQ 外殼互動元件測試：UT-HQ-13（登入頁）、42、43、46、47、48（docs/hq/02）
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HqShell } from "./HqShell";
import { HqEmptyState, HqNoResults, HqOfflineBanner, HqSaveButton } from "./HqStates";
import { HqToastProvider, useHqToast } from "./HqToast";
import { HqLoginPage } from "./HqLoginPage";

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
  it("只顯示傳入的項目，Admin 授權前有分隔線", () => {
    render(shell());
    const nav = screen.getByRole("navigation", { name: "後台導覽" });
    expect(nav).toHaveTextContent("首頁");
    expect(nav).toHaveTextContent("用戶權限管理");
    expect(nav).not.toHaveTextContent("商品");
    const items = Array.from(nav.querySelectorAll("li")).map(li => li.getAttribute("role") ?? li.textContent);
    expect(items).toEqual(["首頁", "用戶權限管理", "separator", "Admin 授權"]);
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
