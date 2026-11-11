import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrushGameRealistic } from "./BrushGameRealistic";
import type { MiniCtx } from "../catgame/minis";

vi.mock("next/image", () => ({
  default: ({ src, alt, onLoad }: { src: string; alt: string; onLoad: () => void }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onLoad={onLoad} />,
}));

afterEach(() => vi.unstubAllGlobals());

it("兩根指標各自控制嘴角與刷具，失去捕捉後停止計分", () => {
  let frame: FrameRequestCallback;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, options: MouseEventInit & { pointerId: number }) {
      super(type, options);
      this.pointerId = options.pointerId;
    }
  }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  const ctx = { cat: { trust: 100, stress: 0 }, brushLevel: 4 } as MiniCtx;
  const view = render(<BrushGameRealistic ctx={ctx} onDone={vi.fn()} />);
  const stage = screen.getByRole("group");
  stage.setPointerCapture = vi.fn();
  stage.hasPointerCapture = () => false;
  vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 300, 400));
  stage.querySelectorAll("img").forEach(image => fireEvent.load(image));

  const send = (event: string, pointerId: number, x: number, y: number) => {
    fireEvent(stage, new TestPointerEvent(event, { bubbles: true, pointerId, clientX: x * 300, clientY: y * 400 }));
  };
  send("pointerdown", 1, .667, .592);
  send("pointermove", 1, .667, .572);
  act(() => frame(16));
  expect(stage.dataset.mouth).toBe("lift");
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
  const progress = screen.getByLabelText("進度", { exact: false }).getAttribute("value");
  send("pointermove", 2, .596, .582);
  act(() => frame(320));
  expect(screen.getByLabelText("進度", { exact: false }).getAttribute("value")).toBe(progress);
  view.unmount();
  expect(cancel).toHaveBeenCalled();
});
