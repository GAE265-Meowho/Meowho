// 用戶權限管理互動元件：UT-HQ-44、45（docs/hq/02 §4.7）
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BanPanel } from "./BanPanel";
import { SuspendPanel } from "./SuspendPanel";

afterEach(cleanup);
const AD_U = { role: "admin" as const, modules: ["user_management" as const] };
const SA = { role: "system_admin" as const, modules: [] };

describe("UT-HQ-44 勾選「停權中」", () => {
  it("展開原因欄與期限；原因未填前「儲存」停用", () => {
    render(<SuspendPanel actor={AD_U} target={{ role: "member" }} suspended={false} onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText("原因")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "停權中" }));
    expect(screen.getByLabelText("原因")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "直到手動解除" })).toBeChecked();
    const save = screen.getByRole("button", { name: "儲存" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("原因"), { target: { value: "多次辱罵" } });
    expect(save).toBeEnabled();
  });
  it("快選原因填入後可儲存，送出停權＋期限", () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<SuspendPanel actor={AD_U} target={{ role: "member" }} suspended={false} onSubmit={submit} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "停權中" }));
    fireEvent.click(screen.getByRole("button", { name: "詐騙" }));
    fireEvent.click(screen.getByRole("radio", { name: "7 天" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    expect(submit).toHaveBeenCalledWith({ suspend: true, reason: "詐騙", duration: "7d" });
  });
  it("取消勾選＝解除停權，顯示「已婉拒的申請不會恢復」", () => {
    render(<SuspendPanel actor={AD_U} target={{ role: "member" }} suspended onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "停權中" }));
    expect(screen.getByText(/已婉拒的申請不會恢復/)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
  });
});

describe("UT-HQ-45 AD-U 開啟管理員帳號", () => {
  it("停權 checkbox 停用，旁註「需由系統管理員處理」", () => {
    render(<SuspendPanel actor={AD_U} target={{ role: "admin" }} suspended={false} onSubmit={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "停權中" })).toBeDisabled();
    expect(screen.getByText("需由系統管理員處理")).toBeInTheDocument();
  });
  it("系統管理員帳號：系統管理員不能被停權", () => {
    render(<SuspendPanel actor={SA} target={{ role: "system_admin" }} suspended={false} onSubmit={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "停權中" })).toBeDisabled();
    expect(screen.getByText("系統管理員不能被停權")).toBeInTheDocument();
  });
});

describe("黑名單（R9）", () => {
  it("管理員帳號：按鈕停用並註明需先撤銷管理員身分", () => {
    render(<BanPanel actor={SA} target={{ role: "admin", email: "a@x.com" }} banned={false} onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "加入黑名單" })).toBeDisabled();
    expect(screen.getByText("需先撤銷管理員身分")).toBeInTheDocument();
  });
  it("須輸入相符的 Email 與原因才能加入", () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<BanPanel actor={SA} target={{ role: "member", email: "Cat@X.com" }} banned={false} onSubmit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "加入黑名單" }));
    const save = screen.getByRole("button", { name: "確認加入黑名單" });
    fireEvent.change(screen.getByLabelText("原因"), { target: { value: "重複詐騙" } });
    fireEvent.change(screen.getByLabelText("輸入對方 Email 確認"), { target: { value: "cat@y.com" } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("輸入對方 Email 確認"), { target: { value: " cat@x.com " } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(submit).toHaveBeenCalledWith({ ban: true, reason: "重複詐騙" });
  });
  it("非系統管理員不顯示黑名單操作", () => {
    const { container } = render(<BanPanel actor={AD_U} target={{ role: "member", email: "c@x.com" }} banned={false} onSubmit={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
