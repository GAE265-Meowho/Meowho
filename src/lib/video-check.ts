// 房間影片上傳前的快速檢查（搬自 3Dtest/capture_coach.html 第 3 步，只留「掃描空間」）。
// 在瀏覽器裡每秒取 2 張畫面，算清晰度（Laplacian 方差，和 pipeline/preprocess.py 同一種指標）、亮度、畫面變化量，
// 不是真的 3D 重建；「移動太快」「回到起點」是推測值。

export interface Sample { t: number; sharp: number; bright: number; darkFrac: number; thumb: Float32Array; img?: string }
export type FrameStatus = "ok" | "blur" | "dark" | "fast";
export type Level = "ok" | "warn" | "bad";
export interface Issue { lvl: Level; title: string; body: string }
export interface Check {
  level: Level; issues: Issue[]; status: FrameStatus[]; usable: number; target: number;
  dur: number; vw: number; vh: number; fracs: Record<"blur" | "dark" | "fast", number>;
}

const THUMB_W = 32, THUMB_H = 18;
const TARGET = 150;  // 房間至少要的清楚影格數（pipeline 每秒取 3 張）

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
export const fmtT = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// 正規化相關係數：頭尾畫面像不像（有沒有走回起點）
function ncc(a: Float32Array, b: Float32Array) {
  let ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
  ma /= a.length; mb /= b.length;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; s += x * y; sa += x * x; sb += y * y; }
  return s / Math.sqrt(sa * sb + 1e-9);
}

export function evaluate(S: Sample[], dur: number, vw: number, vh: number): Check {
  const n = S.length;
  const blurThr = Math.max(40, median(S.map(s => s.sharp)) * 0.45);
  const diffs = S.map((s, i) => {
    if (i === 0) return 0;
    let d = 0;
    for (let k = 0; k < s.thumb.length; k++) d += Math.abs(s.thumb[k] - S[i - 1].thumb[k]);
    return d / s.thumb.length / Math.max(0.25, s.t - S[i - 1].t) * 0.5;  // 換算成每 0.5 秒的變化量
  });
  const fastThr = Math.max(28, median(diffs) * 2.4);
  const status: FrameStatus[] = S.map((s, i) =>
    s.darkFrac > 0.5 || s.bright < 40 ? "dark" : s.sharp < blurThr ? "blur" : diffs[i] > fastThr ? "fast" : "ok");
  const frac = (st: FrameStatus) => status.filter(x => x === st).length / n;
  const fracs = { blur: frac("blur"), dark: frac("dark"), fast: frac("fast") };
  const edge = Math.max(3, Math.round(n * 0.04));
  let loop = -1;
  for (const a of S.slice(0, edge)) for (const b of S.slice(-edge)) loop = Math.max(loop, ncc(a.thumb, b.thumb));
  const usable = Math.round(dur * 3 * (1 - fracs.blur - fracs.dark));
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  const issues: Issue[] = [];
  const add = (lvl: Level, title: string, body: string) => issues.push({ lvl, title, body });
  if (dur < 45) add("bad", `影片太短（${Math.round(dur)} 秒）`, "房間至少要拍 45 秒，才拍得到每個角度。");
  if (fracs.blur > 0.35) add("bad", `${pct(fracs.blur)} 的畫面模糊`, "走慢一點、轉向更慢，光線不夠就把燈都打開。");
  else if (fracs.blur > 0.15) add("warn", `${pct(fracs.blur)} 的畫面模糊`, "模糊的畫面會被自動剔除，但剩下的角度變少。看時間軸的黃色段落。");
  if (fracs.dark > 0.25) add("bad", `${pct(fracs.dark)} 的畫面太暗`, "打開所有燈，或白天再拍。");
  if (fracs.fast > 0.12) {
    const worst = S.filter((_, i) => status[i] === "fast").slice(0, 3).map(s => fmtT(s.t)).join("、");
    add("warn", "有幾段移動太快", `例如 ${worst}。轉向時特別容易太快，轉 90° 至少花 3 秒。`);
  }
  if (loop < 0.55) add("warn", "好像沒有走回起點", "結尾和開頭的畫面不像。最後回到起點再停，房間的頭尾才接得起來。");
  if (Math.min(vw, vh) < 720) add("warn", `解析度偏低（${vw}×${vh}）`, "相機設成 1080p 30fps。");
  if (vh > vw) add("warn", "直拍", "房間橫拍視野比較寬，同樣的路線能拍到更多東西。");
  if (usable < TARGET) add(issues.some(i => i.lvl === "bad") ? "bad" : "warn", `清楚的畫面大約只有 ${usable} 張`, `房間至少要 ${TARGET} 張，拍久一點或走慢一點。`);

  const level: Level = issues.some(i => i.lvl === "bad") ? "bad" : issues.length ? "warn" : "ok";
  if (!issues.length) add("ok", "看起來很好", "清晰度、亮度、速度都沒問題，也有回到起點。");
  return { level, issues, status, usable, target: TARGET, dur, vw, vh, fracs };
}

function once(target: EventTarget, ev: string, ms: number) {
  return new Promise<void>((res, rej) => {
    const h = () => { clearTimeout(t); res(); };
    const t = setTimeout(() => { target.removeEventListener(ev, h); rej(new Error("timeout")); }, ms);
    target.addEventListener(ev, h, { once: true });
  });
}

/** 在瀏覽器裡取樣影片畫面；讀不出來就丟出錯誤（訊息給使用者看） */
export async function sampleVideo(file: File, onProgress: (done: number, total: number) => void, signal: AbortSignal) {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  try {
    await once(v, "loadedmetadata", 8000).catch(() => { throw new Error("讀不到這支影片"); });
    try { await v.play(); v.pause(); } catch { /* iOS 要先播一下才能跳到指定時間 */ }
    const dur = v.duration, vw = v.videoWidth, vh = v.videoHeight;
    if (!isFinite(dur) || dur <= 0 || !vw) throw new Error("讀不到影片長度");
    const scale = 320 / Math.max(vw, vh);
    const W = Math.round(vw * scale), H = Math.round(vh * scale);
    const cv = Object.assign(document.createElement("canvas"), { width: W, height: H });
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    const tc = Object.assign(document.createElement("canvas"), { width: THUMB_W, height: THUMB_H });
    const tctx = tc.getContext("2d", { willReadFrequently: true })!;
    const n = Math.max(20, Math.min(360, Math.round(dur * 2)));
    const S: Sample[] = [];
    for (let i = 0; i < n; i++) {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      const t = (i + 0.5) * dur / n;
      v.currentTime = t;
      try { await once(v, "seeked", 4000); } catch { continue; }
      ctx.drawImage(v, 0, 0, W, H);
      const px = ctx.getImageData(0, 0, W, H).data;
      const g = new Float32Array(W * H);
      let sum = 0, dark = 0;
      for (let k = 0, j = 0; k < g.length; k++, j += 4) {
        const y = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];
        g[k] = y; sum += y; if (y < 25) dark++;
      }
      let m = 0, m2 = 0, cnt = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const k = y * W + x, l = 4 * g[k] - g[k - 1] - g[k + 1] - g[k - W] - g[k + W];
        m += l; m2 += l * l; cnt++;
      }
      m /= cnt;
      tctx.drawImage(cv, 0, 0, THUMB_W, THUMB_H);
      const tp = tctx.getImageData(0, 0, THUMB_W, THUMB_H).data;
      const thumb = new Float32Array(THUMB_W * THUMB_H);
      for (let k = 0, j = 0; k < thumb.length; k++, j += 4) thumb[k] = 0.299 * tp[j] + 0.587 * tp[j + 1] + 0.114 * tp[j + 2];
      S.push({ t, sharp: m2 / cnt - m * m, bright: sum / g.length, darkFrac: dark / g.length, thumb, img: cv.toDataURL("image/jpeg", 0.6) });
      onProgress(i + 1, n);
    }
    if (S.length < 10) throw new Error("這支影片的畫面讀不出來");
    return { samples: S, check: evaluate(S, dur, vw, vh) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
