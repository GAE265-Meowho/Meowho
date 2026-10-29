// 列表共用元件（T-HQ-08）
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HqListBody, HqPager, HqSplit, HqTable, HqToolbar } from "./HqList";

afterEach(cleanup);

describe("HqTable", () => {
  const rows = [{ id: "1", name: "小橘" }, { id: "2", name: "阿灰" }];
  it("每格帶 data-label（手機卡片顯示欄名），點一列開啟詳情", () => {
    const pick = vi.fn();
    render(<HqTable rows={rows} rowKey={r => r.id} onSelect={pick} columns={[{ key: "n", label: "名稱", render: r => r.name }]} />);
    const cell = screen.getByText("阿灰");
    expect(cell).toHaveAttribute("data-label", "名稱");
    fireEvent.click(cell);
    expect(pick).toHaveBeenCalledWith(rows[1]);
  });
});

describe("HqToolbar", () => {
  it("篩選標籤切換、全部＝清除", () => {
    const onStatus = vi.fn();
    render(<HqToolbar placeholder="搜尋" onSearch={() => {}} statuses={[{ value: "pending", label: "待審" }]} status="pending" onStatus={onStatus} />);
    expect(screen.getByRole("button", { name: "待審" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    expect(onStatus).toHaveBeenCalledWith(undefined);
  });
  it("送出搜尋", () => {
    const onSearch = vi.fn();
    render(<HqToolbar placeholder="搜尋" onSearch={onSearch} />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "tina" } });
    fireEvent.submit(input.closest("form")!);
    expect(onSearch).toHaveBeenCalledWith("tina");
  });
});

describe("HqListBody 狀態", () => {
  const base = { loading: false, error: false, onRetry: () => {}, onClear: () => {}, empty: { message: "目前沒有待審的中途認證", actionLabel: "回待辦總覽", onAction: () => {} } };
  it("沒有資料：睡貓＋說明", () => {
    render(<HqListBody {...base} total={0} filtered={false}><p>list</p></HqListBody>);
    expect(screen.getByRole("img", { name: "睡著的貓" })).toBeInTheDocument();
  });
  it("篩選無結果：只有文字＋清除篩選", () => {
    render(<HqListBody {...base} total={0} filtered><p>list</p></HqListBody>);
    expect(screen.getByRole("button", { name: "清除篩選" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("有資料時顯示內容", () => {
    render(<HqListBody {...base} total={2} filtered={false}><p>list</p></HqListBody>);
    expect(screen.getByText("list")).toBeInTheDocument();
  });
});

describe("HqPager／HqSplit", () => {
  it("只有一頁時只顯示筆數", () => {
    render(<HqPager page={1} pageCount={1} total={7} onPage={() => {}} />);
    expect(screen.getByText("共 7 筆")).toBeInTheDocument();
  });
  it("詳情面板有返回列表", () => {
    const close = vi.fn();
    render(<HqSplit list={<p>L</p>} detail={<p>D</p>} onClose={close} />);
    fireEvent.click(screen.getByRole("button", { name: "← 返回列表" }));
    expect(close).toHaveBeenCalled();
  });
});
