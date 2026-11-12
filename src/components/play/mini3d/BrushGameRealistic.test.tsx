import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrushGameRealistic } from "./BrushGameRealistic";
import { mouthCloseup, toothZones } from "@/lib/play/mini3d/brush-photo-regions";
import type { MiniCtx } from "../catgame/minis";

vi.mock("next/image", () => ({
  default: ({ src, alt, onLoad, onError, loading }: { src: string; alt: string; onLoad: () => void; onError: () => void; loading: "lazy" | "eager" }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading={loading} onLoad={onLoad} onError={onError} />,
}));

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

it("預載三張 WebP 影像後才啟用遊戲，影像失敗時顯示錯誤", () => {
  const ctx = { cat: { trust: 100, stress: 0 }, brushLevel: 4 } as MiniCtx;
  const view = render(<dialog open><BrushGameRealistic ctx={ctx} onDone={vi.fn()} reactionSrc="" /></dialog>);
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

  const failed = render(<BrushGameRealistic ctx={ctx} onDone={vi.fn()} reactionSrc="" />);
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
  const view = render(<dialog open><BrushGameRealistic ctx={ctx} onDone={vi.fn()} reactionSrc="" /></dialog>);
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

  const sendTool = (event: string, id: number, index: number, dy: number, pointerType = "touch") => {
    const bounds = new DOMRect(22.5, 24, 255, 255 * mouthCloseup.height * 4 / (mouthCloseup.width * 3));
    const crop = screen.getByLabelText("牙齒外側特寫");
    crop.getBoundingClientRect = () => bounds;
    const zone = toothZones(6)[index];
    const x = bounds.left + (zone.x - mouthCloseup.x) / mouthCloseup.width * bounds.width;
    const y = bounds.top + (zone.y + dy - mouthCloseup.y) / mouthCloseup.height * bounds.height;
    send(event, id, x / 300, y / 400, pointerType);
  };
  expect(stage.setPointerCapture).toHaveBeenCalledWith(1);
  sendTool("pointerdown", 2, 3, 0);
  sendTool("pointermove", 2, 3, .008);
  sendTool("pointermove", 2, 3, 0);
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
  sendTool("pointermove", 3, 4, 0, "mouse");
  sendTool("pointermove", 3, 4, .008, "mouse");
  sendTool("pointermove", 3, 4, 0, "mouse");
  act(() => frame(632));
  expect(Number(screen.getByLabelText("進度", { exact: false }).getAttribute("value"))).toBeGreaterThan(Number(progress));
  fireEvent.keyUp(stage, { code: "Space" });
  act(() => frame(648));
  expect(stage.dataset.mouth).toBe("closed");
  stage.hasPointerCapture = id => id === 4;
  stage.releasePointerCapture = vi.fn();
  send("pointerdown", 4, .667, .592);
  send("pointermove", 4, .667, .542);
  for (let time = 748; time <= 14148; time += 100) act(() => frame(time));
  expect(stage.dataset.feedback).toBe("resisting");
  expect(stage.dataset.mouth).toBe("closed");
  expect(stage.releasePointerCapture).toHaveBeenCalledWith(4);
  expect(stage.querySelector("video")).toBeNull();
  view.unmount();
  expect(cancel).toHaveBeenCalled();
});

it.each([
  { level: 4, trust: 0, stress: 100, hold: true, feedback: "bitten", result: { bitten: true, ran: false, score: 0 } },
  { level: 4, trust: 0, stress: 100, hold: false, feedback: "ran", result: { bitten: false, ran: true, score: 0 } },
  { level: 0, trust: 100, stress: 0, hold: true, feedback: "success", result: { bitten: false, ran: false, score: 100 } },
])("顯示 $feedback 並在確認後回傳原始結果", ({ level, trust, stress, hold, feedback, result }) => {
  let next: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { next = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const ctx = { cat: { trust, stress }, brushLevel: level } as MiniCtx;
  const onDone = vi.fn();
  const view = render(<dialog open><BrushGameRealistic ctx={ctx} onDone={onDone} reactionSrc="" /></dialog>);
  const stage = screen.getByRole("group");
  stage.focus();
  stage.querySelectorAll("img").forEach(image => fireEvent.load(image));
  fireEvent.keyDown(stage, { code: "Space" });
  if (!hold) fireEvent.keyUp(stage, { code: "Space" });
  const reactions = new Set<string | undefined>();
  for (let time = 0; next && time <= 30000; time += 100) {
    const callback = next;
    next = undefined;
    act(() => callback(time));
    reactions.add(stage.dataset.feedback);
  }
  if (feedback === "bitten") expect(reactions.has("resisting")).toBe(true);
  if (feedback === "ran") expect(reactions.has("warning")).toBe(true);
  expect(stage.dataset.feedback).toBe(feedback);
  expect(stage.dataset.mouth).toBe("closed");
  expect(next).toBeUndefined();
  expect(onDone).not.toHaveBeenCalled();
  fireEvent.keyDown(stage, { code: "Space" });
  expect(next).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "確認結果" }));
  expect(onDone).toHaveBeenCalledWith(result);
  view.unmount();
});

it("掙扎只播放一次，播放結束與規則結束後才重新開放操作", () => {
  let frame: FrameRequestCallback;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const ctx = { cat: { trust: 0, stress: 100 }, brushLevel: 4 } as MiniCtx;
  const view = render(<dialog open><BrushGameRealistic ctx={ctx} onDone={vi.fn()} /></dialog>);
  const stage = screen.getByRole("group");
  stage.focus();
  stage.querySelectorAll("img").forEach(image => fireEvent.load(image));
  expect(stage.querySelector("video")).toBeNull();
  fireEvent.keyDown(stage, { code: "Space" });
  for (let time = 0; time <= 4100; time += 100) act(() => frame(time));
  const video = stage.querySelector("video")!;
  expect(video).toBeTruthy();
  expect(video.getAttribute("src")).toBe("/play/brush/brush-turn-away.mp4");
  expect(video.muted && video.playsInline).toBe(true);
  expect(play).toHaveBeenCalledTimes(1);
  expect(stage.dataset.mouth).toBe("closed");
  expect(screen.queryByLabelText("牙齒外側特寫")).toBeNull();
  fireEvent.keyUp(stage, { code: "Space" });
  for (let time = 4200; time <= 5500; time += 100) act(() => frame(time));
  fireEvent.keyDown(stage, { code: "Space" });
  act(() => frame(5600));
  expect(stage.dataset.mouth).toBe("closed");
  fireEvent.ended(video);
  fireEvent.keyDown(stage, { code: "Space" });
  for (const time of [5700, 5800, 5900]) act(() => frame(time));
  expect(stage.dataset.mouth).toBe("teeth");
  expect(play).toHaveBeenCalledTimes(1);
  view.unmount();
  play.mockRestore();
});

it.each(["error", "rejected", "reduced"] as const)("反應影片 %s 時保留閉嘴照片並允許重新操作", async (failure) => {
  let frame: FrameRequestCallback;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: failure === "reduced" })));
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() =>
    failure === "rejected" ? Promise.reject(new Error("Autoplay denied")) : Promise.resolve());
  const ctx = { cat: { trust: 0, stress: 100 }, brushLevel: 4 } as MiniCtx;
  const view = render(<dialog open><BrushGameRealistic ctx={ctx} onDone={vi.fn()} reactionSrc="/reaction.mp4" /></dialog>);
  const stage = screen.getByRole("group");
  stage.focus();
  stage.querySelectorAll("img").forEach(image => fireEvent.load(image));
  fireEvent.keyDown(stage, { code: "Space" });
  for (let time = 0; time <= 4100; time += 100) act(() => frame(time));
  if (failure === "error") fireEvent.error(stage.querySelector("video")!);
  await act(async () => {});
  expect(stage.querySelector("video")).toBeNull();
  expect(play).toHaveBeenCalledTimes(failure === "reduced" ? 0 : 1);
  expect(stage.dataset.mouth).toBe("closed");
  fireEvent.keyUp(stage, { code: "Space" });
  for (let time = 4200; time <= 5500; time += 100) act(() => frame(time));
  fireEvent.keyDown(stage, { code: "Space" });
  for (const time of [5600, 5700, 5800]) act(() => frame(time));
  expect(stage.dataset.mouth).toBe("teeth");
  view.unmount();
  play.mockRestore();
});
