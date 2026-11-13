import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Mini3DModal } from "./Mini3DModal";

const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});
afterEach(() => {
  cleanup();
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShow);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

describe("3D 小遊戲彈窗", () => {
  it("開啟、聚焦標題，取消按鈕與 Escape 都回報取消，卸載時關閉", () => {
    const cancel = vi.fn();
    const view = render(<Mini3DModal title="摸摸麻糬" onCancel={cancel}><p>遊戲內容</p></Mini3DModal>);
    const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: "摸摸麻糬" });
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("heading"));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    const escape = new Event("cancel", { cancelable: true });
    fireEvent(dialog, escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(dialog.open).toBe(false);
  });
});
