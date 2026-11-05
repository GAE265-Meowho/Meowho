import { describe, expect, it } from "vitest";
import { evaluate, type Sample } from "./video-check";

// 假影格：每張畫面不同但變化平緩；blurAt 這些影格清晰度很低
function samples(n: number, opts: { blurAt?: (i: number) => boolean; bright?: number; loop?: boolean } = {}): Sample[] {
  const S = Array.from({ length: n }, (_, i) => ({
    t: i / 2, sharp: opts.blurAt?.(i) ? 20 : 300 + (i % 9) * 10, bright: opts.bright ?? 128, darkFrac: 0,
    thumb: new Float32Array(576).map((_, k) => 120 + 60 * Math.sin(k * 0.3 + i * 0.05)),
  }));
  if (opts.loop !== false) S[n - 1].thumb = S[0].thumb;
  return S;
}

describe("video-check evaluate", () => {
  it("90 秒、清楚、有回到起點的橫拍影片合格", () => {
    const c = evaluate(samples(180), 90, 1920, 1080);
    expect(c.level).toBe("ok");
    expect(c.usable).toBe(270);
  });

  it("太短直接建議重拍", () => {
    const c = evaluate(samples(40), 20, 1920, 1080);
    expect(c.level).toBe("bad");
    expect(c.issues[0].title).toContain("太短");
  });

  it("一半畫面模糊建議重拍", () => {
    const c = evaluate(samples(180, { blurAt: i => i % 2 === 0 }), 90, 1920, 1080);
    expect(c.level).toBe("bad");
    expect(c.status.filter(s => s === "blur").length).toBe(90);
  });

  it("太暗建議重拍", () => {
    expect(evaluate(samples(180, { bright: 20 }), 90, 1920, 1080).level).toBe("bad");
  });

  it("直拍只是提醒，可以轉", () => {
    const c = evaluate(samples(180), 90, 1080, 1920);
    expect(c.level).toBe("warn");
    expect(c.issues.map(i => i.title)).toContain("直拍");
  });
});
