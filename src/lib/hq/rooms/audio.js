// 碰撞音效：濾過的雜訊加短音，音色依材質、音量依撞擊強度
// 改寫自 wesbos/3d-model-anything packages/room-physics/audio.ts（MIT，Copyright (c) 2026 Wes Bos，授權全文見同資料夾 CREDITS.txt）
const TONES = (size) => ({
  soft: { f: 260, q: 0.5, decay: 0.06, type: "lowpass" },
  rubber: { f: 700, q: 2, decay: 0.07, type: "bandpass", tone: 190 },
  wood: { f: 1300 - size * 700, q: 3, decay: 0.09, type: "bandpass", tone: 150 - size * 60 },
  cardboard: { f: 600 - size * 250, q: 1, decay: 0.07, type: "lowpass" },
  plastic: { f: 1700 - size * 900, q: 2.5, decay: 0.06, type: "bandpass" },
  metal: { f: 2600 - size * 1200, q: 9, decay: 0.22, type: "bandpass", tone: 520 - size * 250 },
  glass: { f: 3200, q: 10, decay: 0.16, type: "bandpass", tone: 1400 },
  stone: { f: 900, q: 2, decay: 0.08, type: "bandpass", tone: 110 },
});

export class Impacts {
  ctx = null;
  master = null;
  noise = null;
  last = new Map();
  muted = false;
  volume = 0.5;

  constructor() {
    try { this.muted = localStorage.getItem("cat-muted") === "1"; } catch { /* 沒有 localStorage 就用預設 */ }
  }

  // 瀏覽器要使用者操作過才能出聲
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.createDynamicsCompressor()).connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.25);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    try { localStorage.setItem("cat-muted", this.muted ? "1" : "0"); } catch { /* 下次重開會恢復預設 */ }
    return this.muted;
  }

  // strength 0~1，size 是物品最長邊（公尺）
  hit(key, surface, strength, size) {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise || this.muted || ctx.state !== "running") return;
    const s = Math.min(1, Math.max(0, strength));
    if (!Number.isFinite(s) || s < 0.04) return;
    const t = performance.now();
    if (t - (this.last.get(key) ?? 0) < 250) return;
    this.last.set(key, t);

    const now = ctx.currentTime;
    const peak = 0.08 + s * 0.6;
    const sizeK = Math.min(1, Math.max(0, size / 0.6));
    const p = TONES(sizeK)[surface] || TONES(sizeK).plastic;
    const decay = p.decay * (0.7 + sizeK * 0.8);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak * (surface === "soft" ? 0.5 : 1), now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + decay);
    const filter = ctx.createBiquadFilter();
    filter.type = p.type;
    filter.frequency.value = p.f * (0.9 + Math.random() * 0.2);
    filter.Q.value = p.q;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    src.connect(filter).connect(gain).connect(master);
    src.start(now);
    src.stop(now + decay + 0.02);
    if (p.tone) {  // 木頭、金屬、玻璃多一段短音
      const osc = ctx.createOscillator(), og = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(p.tone * 1.25, now);
      osc.frequency.exponentialRampToValueAtTime(p.tone, now + decay);
      og.gain.setValueAtTime(0, now);
      og.gain.linearRampToValueAtTime(peak * 0.35, now + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0005, now + decay * 1.2);
      osc.connect(og).connect(master);
      osc.start(now);
      osc.stop(now + decay * 1.2 + 0.02);
    }
  }
}
