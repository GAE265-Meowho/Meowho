import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BgmInput } from "@/lib/play/audio";

// 假的 Audio：記下每個建出來的音檔、有沒有在播
class FakeAudio {
  static made: FakeAudio[] = [];
  src: string; loop = false; volume = 1; preload = ""; paused = true;
  constructor(src: string) { this.src = src; FakeAudio.made.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  removeAttribute() {}
}

const STORE = "https://demo.supabase.co/storage/v1/object/public/meow-play-audio";
const DAILY = `${STORE}/bgm/bgm_daily.mp3`;
const NIGHT = `${STORE}/bgm/bgm_night.mp3`;

const playing = () => FakeAudio.made.filter(a => !a.paused).map(a => a.src);

async function setup() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://demo.supabase.co");
  FakeAudio.made = [];
  window.localStorage.clear();
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(performance.now() + 10_000); return 0; });
  const mod = await import("./PlayAudio");
  function Game(input: BgmInput) { mod.usePlayBgm(input); return <mod.SoundToggle />; }
  return { Game };
}

const daily: BgmInput = { step: "shop", nodeId: null, scene: { bg: "room", time: "day" }, home: false };
const night: BgmInput = { step: "node", nodeId: "day30", scene: { bg: "room", time: "night" }, home: false };

beforeEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterEach(cleanup);

describe("虛擬飼養的背景音樂", () => {
  it("點畫面之前不出聲，第一次點擊後開始播（手機瀏覽器的規定）", async () => {
    const { Game } = await setup();
    render(<Game {...daily} />);
    expect(playing()).toEqual([]);
    await act(async () => { fireEvent.pointerDown(window); });
    expect(playing()).toEqual([DAILY]);
    expect(FakeAudio.made[0].loop).toBe(true);
  });

  it("場景換到半夜就換曲，舊的那首停掉", async () => {
    const { Game } = await setup();
    const { rerender } = render(<Game {...daily} />);
    await act(async () => { fireEvent.pointerDown(window); });
    await act(async () => { rerender(<Game {...night} />); });
    expect(playing()).toEqual([NIGHT]);
  });

  it("按靜音就停，再按一次接著播，選擇記在瀏覽器", async () => {
    const { Game } = await setup();
    render(<Game {...daily} />);
    await act(async () => { fireEvent.pointerDown(window); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "關閉聲音" })); });
    expect(playing()).toEqual([]);
    expect(window.localStorage.getItem("meowho.play.muted")).toBe("1");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "開啟聲音" })); });
    expect(playing()).toEqual([DAILY]);
  });

  it("上次選了靜音，這次進來也不出聲", async () => {
    const { Game } = await setup();
    window.localStorage.setItem("meowho.play.muted", "1");
    render(<Game {...daily} />);
    await act(async () => { fireEvent.pointerDown(window); });
    expect(playing()).toEqual([]);
    expect(screen.getByRole("button", { name: "開啟聲音" })).toHaveAttribute("aria-pressed", "true");
  });

  it("離開遊戲就停掉背景音樂", async () => {
    const { Game } = await setup();
    const { unmount } = render(<Game {...daily} />);
    await act(async () => { fireEvent.pointerDown(window); });
    unmount();
    expect(playing()).toEqual([]);
  });

  it("沒連資料庫（示範模式）時不出聲也不出錯", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    FakeAudio.made = [];
    vi.stubGlobal("Audio", FakeAudio);
    const mod = await import("./PlayAudio");
    function Game(input: BgmInput) { mod.usePlayBgm(input); return null; }
    render(<Game {...daily} />);
    await act(async () => { fireEvent.pointerDown(window); });
    expect(FakeAudio.made).toEqual([]);
  });

  it("還沒有音檔的音效呼叫了不會出聲也不會出錯", async () => {
    await setup();
    const player = await import("@/lib/play/audio-player");
    player.unlockAudio();
    expect(() => player.playSfx("sfx_pour_water")).not.toThrow();
    expect(FakeAudio.made).toEqual([]);
  });
});
