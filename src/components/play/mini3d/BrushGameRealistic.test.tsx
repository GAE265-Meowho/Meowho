import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrushGameRealistic } from "./BrushGameRealistic";
import type { MiniCtx } from "../catgame/minis";

vi.mock("next/image", () => ({
  default: ({ src, alt, onLoad, onError, loading }: { src: string; alt: string; onLoad: () => void; onError: () => void; loading: "lazy" | "eager" }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading={loading} onLoad={onLoad} onError={onError} />,
}));

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

it("預載三張 WebP 影像後才啟用遊戲，影像失敗時顯示錯誤", () => {
  const ctx = { cat: { trust: 100, stress: 0 }, brushLevel: 4 } as MiniCtx;
  const view = render(<dialog open><BrushGameRealistic ctx={ctx} onDone={vi.fn()} /></dialog>);
  const images = view.container.querySelectorAll("img");
  expect([...images].map(image => image.getAttribute("src"))).toEqual([
    "/play/brush/brush-closed.webp",
    "/play/brush/brush-lift.webp",
    "/play/brush/brush-teeth.webp",
  ]);
  expect([...images].every(image => image.getAttribute("loading") === "eager")).toBe(true);
  expect(screen.getByText("刷牙影像載入中…")).toBeTruthy();
  images.forEach(image => fireEvent.load(image));
  expect(screen.queryByText("刷牙影像載入中…")).toBeNull();
  view.unmount();

  const failed = render(<BrushGameRealistic ctx={ctx} onDone={vi.fn()} />);
  fireEvent.error(failed.container.querySelector("img")!);
  expect(screen.getByRole("alert").textContent).toContain("無法載入刷牙影像");
  failed.unmount();
});

it("兩根指標各自控制嘴角與刷具，失去捕捉後停止計分", () => {
  let frame: FrameRequestCallback;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, options: MouseEventInit & { pointerId: number; pointerType: string }) {
      super(type, options);
      this.pointerId = options.pointerId;
      this.pointerType = options.pointerType;
    }
  }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  const ctx = { cat: { trust: 100, stress: 0 }, brushLevel: 4 } as MiniCtx;
  const view = render(<dialog open><BrushGameRealistic ctx={ctx} onDone={vi.fn()} /></dialog>);
  const stage = screen.getByRole("group");
  stage.focus();
  stage.setPointerCapture = vi.fn();
  stage.hasPointerCapture = () => false;
  vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 300, 400));
  stage.querySelectorAll("img").forEach(image => fireEvent.load(image));

  const send = (event: string, pointerId: number, x: number, y: number, pointerType = "touch") => {
    fireEvent(stage, new TestPointerEvent(event, { bubbles: true, pointerId, pointerType, clientX: x * 300, clientY: y * 400 }));
  };
  send("pointermove", 3, .667, .592, "mouse");
  act(() => frame(0));
  expect(stage.dataset.mouth).toBe("closed");
  expect(stage.dataset.lipHover).toBe("true");
  send("pointerdown", 1, .667, .592);
  send("pointermove", 1, .667, .572);
  act(() => frame(16));
  expect(stage.dataset.mouth).toBe("lift");
  expect(Number(stage.style.getPropertyValue("--lift-opacity"))).toBeGreaterThan(0);
  expect(Number(stage.style.getPropertyValue("--teeth-opacity"))).toBeLessThan(1);
  send("pointermove", 1, .667, .542);
  act(() => frame(32));
  expect(stage.dataset.mouth).toBe("teeth");

  send("pointerdown", 2, .596, .573);
  send("pointermove", 2, .596, .582);
  act(() => frame(128));
  expect(Number(screen.getByLabelText("進度", { exact: false }).getAttribute("value"))).toBeGreaterThan(0);
  send("lostpointercapture", 1, .667, .542);
  send("pointermove", 2, .596, .573);
  act(() => frame(224));
  expect(stage.dataset.mouth).toBe("closed");
  expect(Number(stage.style.getPropertyValue("--teeth-opacity"))).toBeLessThan(1);
  const progress = screen.getByLabelText("進度", { exact: false }).getAttribute("value");
  send("pointermove", 2, .596, .582);
  act(() => frame(320));
  expect(screen.getByLabelText("進度", { exact: false }).getAttribute("value")).toBe(progress);
  send("pointerup", 2, .596, .582);
  fireEvent.keyDown(stage, { code: "Space" });
  act(() => frame(336));
  expect(stage.dataset.mouth).not.toBe("teeth");
  act(() => frame(436));
  act(() => frame(536));
  expect(stage.dataset.mouth).toBe("teeth");
  send("pointermove", 3, .624, .565, "mouse");
  send("pointermove", 3, .624, .574, "mouse");
  act(() => frame(632));
  expect(Number(screen.getByLabelText("進度", { exact: false }).getAttribute("value"))).toBeGreaterThan(Number(progress));
  fireEvent.keyUp(stage, { code: "Space" });
  act(() => frame(648));
  expect(stage.dataset.mouth).toBe("closed");
  view.unmount();
  expect(cancel).toHaveBeenCalled();
});
