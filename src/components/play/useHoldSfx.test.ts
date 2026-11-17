// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stopFn = vi.fn();
const playSfx = vi.fn(() => stopFn);
vi.mock("@/lib/play/audio-player", () => ({ playSfx: (...a: unknown[]) => (playSfx as unknown as (...x: unknown[]) => unknown)(...a) }));
import { useHoldSfx } from "./useHoldSfx";

describe("useHoldSfx：持續才有聲音", () => {
  beforeEach(() => { vi.useFakeTimers(); playSfx.mockClear(); stopFn.mockClear(); });
  afterEach(() => vi.useRealTimers());

  it("第一次動作開始循環播，持續動作不重複播", () => {
    const { result } = renderHook(() => useHoldSfx("sfx_purr", 0.8, 400));
    act(() => result.current.poke());
    act(() => { vi.advanceTimersByTime(200); result.current.poke(); });
    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith("sfx_purr", 0.8, { loop: true });
  });
  it("沒再動作超過 idleMs 就停；之後再動作又會響", () => {
    const { result } = renderHook(() => useHoldSfx("sfx_purr", 0.8, 400));
    act(() => result.current.poke());
    act(() => { vi.advanceTimersByTime(600); });
    expect(stopFn).toHaveBeenCalledTimes(1);
    act(() => result.current.poke());
    expect(playSfx).toHaveBeenCalledTimes(2);
  });
  it("放手 stop() 馬上停；離開畫面也停", () => {
    const { result, unmount } = renderHook(() => useHoldSfx("sfx_purr", 0.8, 400));
    act(() => result.current.poke());
    act(() => result.current.stop());
    expect(stopFn).toHaveBeenCalledTimes(1);
    act(() => result.current.poke());
    unmount();
    expect(stopFn).toHaveBeenCalledTimes(2);
  });
});
