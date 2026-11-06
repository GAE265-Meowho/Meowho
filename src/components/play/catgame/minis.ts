// 虛擬飼養 DEMO（#237）：catgame 原版的小遊戲，搬自團隊專題專案 catgame/src（12-mini-core、14-mini-play、19-mini-scoop、23-story-minis、
// 10-cat-drawing）。玩法、判定、提示文字照原版；原版是 vanilla JS 直接操作 DOM，這裡保留同樣的寫法，只改成：
//   - 畫在呼叫端給的 root 裡（不用全域的 #mini），id 一律在 root 裡找
//   - 原版的全域狀態 S（貓的年紀、信任、壓力、喜歡的玩具與節奏）改成參數 ctx
//   - 結束時呼叫 onDone(結果)，結果格式同原版（hide：0 等牠出來／1 硬抓；scoop：{ bagged, total, small }；play：{ fun, toy, match, rhythmOk }）
// 用到的原版共用函式：liveFrame、miniFrame、bindMiniButtons、bindLive、trackPointer、loopWith、miniMeter、setBar、setText、svgPt、
// catParts、catScale、catMood、bedSVG、toySVG。樣式在 catgame.module.css（原版 style 的對應段落）。
// 只在瀏覽器執行（PlayGame 的 client component 裡呼叫）。

export type ToyKey = "feather" | "mouse" | "ribbon";
export type RhythmKey = "quick" | "slow";

/** 原版 S 裡小遊戲用得到的欄位 */
export interface MiniCtx {
  /** 幾個月大 */
  age: number;
  cat: { body: number; trust: number; stress: number; toyPref: ToyKey; rhythm: RhythmKey };
  toys: ToyKey[];
}

export type MiniId = "hide" | "scoop" | "play";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------- 10-cat-drawing：貓咪繪圖 ----------
export function catParts(s: Pick<MiniCtx, "cat">): string {
  const bw = 0.8 + (s.cat.body - 5) * 0.1;
  return `<g stroke="var(--cat-line)" stroke-width="2.6" stroke-linejoin="round">
    <g class="tail"><path d="M${30 * bw},-14 C${74 * bw},-12 ${78 * bw},-62 ${54 * bw},-78" fill="none" stroke-width="11" stroke-linecap="round"/>
    <path d="M${30 * bw},-14 C${74 * bw},-12 ${78 * bw},-62 ${54 * bw},-78" fill="none" stroke="var(--fur)" stroke-width="6" stroke-linecap="round"/></g>
    <g class="breathe">
      <ellipse cx="0" cy="-40" rx="${42 * bw}" ry="40" fill="var(--fur)"/>
      <ellipse cx="-16" cy="-3" rx="11" ry="6" fill="var(--fur)"/><ellipse cx="16" cy="-3" rx="11" ry="6" fill="var(--fur)"/>
      <g class="earL"><path d="M-27,-104 L-22,-134 L-4,-116 Z" fill="var(--fur)"/><path d="M-22,-109 L-20,-125 L-11,-115 Z" fill="var(--paw)" stroke="none"/></g>
      <g class="earR"><path d="M27,-104 L22,-134 L4,-116 Z" fill="var(--fur)"/><path d="M22,-109 L20,-125 L11,-115 Z" fill="var(--paw)" stroke="none"/></g>
      <circle cx="0" cy="-92" r="30" fill="var(--fur)"/>
      ${TABBY}
      <g class="eyes-open blink" stroke="none"><ellipse cx="-10" cy="-94" rx="3.2" ry="5" fill="var(--cat-line)"/><ellipse cx="10" cy="-94" rx="3.2" ry="5" fill="var(--cat-line)"/></g>
      <g class="eyes-wide" stroke="none"><circle cx="-10" cy="-94" r="6.5" fill="var(--cat-line)"/><circle cx="10" cy="-94" r="6.5" fill="var(--cat-line)"/><circle cx="-8" cy="-96.5" r="2.2" fill="var(--fur)"/><circle cx="12" cy="-96.5" r="2.2" fill="var(--fur)"/></g>
      <g class="eyes-closed"><path d="M-15,-93 q5,-6 10,0 M5,-93 q5,-6 10,0" fill="none" stroke-width="3" stroke-linecap="round"/></g>
      <path d="M-3,-84 L3,-84 L0,-80 Z" fill="var(--paw)" stroke="none"/>
      <path d="M-6,-77 q6,4 6,-2 q0,6 6,2" fill="none" stroke-width="1.8"/>
      <path d="M-14,-82 L-34,-85 M-14,-79 L-33,-76 M14,-82 L34,-85 M14,-79 L33,-76" stroke-width="1.2" opacity=".55"/>
    </g></g>`;
}
/** DEMO：麻糬是虎斑，在原版的貓頭和身上加幾道條紋（顏色 --stripe） */
const TABBY = `<g stroke="var(--stripe)" stroke-width="3" stroke-linecap="round" fill="none" opacity=".75">
  <path d="M-8,-120 L-6,-110 M0,-122 L0,-111 M8,-120 L6,-110"/><path d="M-26,-50 q8,4 14,0 M-28,-34 q8,4 14,0 M26,-50 q-8,4 -14,0 M28,-34 q-8,4 -14,0"/></g>`;
export function catMood(s: Pick<MiniCtx, "cat">): string {
  const C = s.cat;
  return [C.trust > 65 && C.stress < 40 ? "purr" : "", C.stress > 60 ? "flat wide" : ""].join(" ").trim();
}
export const catScale = (s: Pick<MiniCtx, "age">) => (s.age < 12 ? 0.68 + 0.32 * (s.age - 2) / 10 : 1);

/** 臥室的床（側面）：給「到家第一天躲床底」用，座標是 320×220 */
function bedSVG(): string {
  return `<rect x="0" y="0" width="320" height="150" fill="var(--wall)"/><rect x="0" y="150" width="320" height="70" fill="var(--floor)"/><rect x="0" y="146" width="320" height="5" fill="var(--wood)"/>
    <rect x="232" y="20" width="62" height="50" rx="3" fill="var(--sky-day)" stroke="var(--wood)" stroke-width="4"/><path d="M263,20 V70 M232,45 H294" stroke="var(--wood)" stroke-width="2.5"/>
    <rect x="56" y="130" width="210" height="44" fill="var(--cat-line)" opacity=".85"/>
    <rect x="34" y="56" width="22" height="122" rx="7" fill="var(--wood)" stroke="var(--cat-line)" stroke-width="1.5"/>
    <rect x="266" y="90" width="16" height="88" rx="5" fill="var(--wood)" stroke="var(--cat-line)" stroke-width="1.5"/>
    <rect x="54" y="120" width="214" height="12" fill="var(--wood)" stroke="var(--cat-line)" stroke-width="1.5"/>
    <rect x="54" y="98" width="212" height="24" rx="6" fill="var(--sand)" stroke="var(--cat-line)" stroke-width="1.5"/>
    <rect x="60" y="84" width="54" height="20" rx="10" fill="var(--fur)" stroke="var(--cat-line)" stroke-width="1.5"/>
    <path d="M110,97 Q190,88 266,97 L266,140 Q251,134 236,140 Q221,134 206,140 Q191,134 176,140 Q161,134 146,140 Q131,134 116,140 Q112,138 110,140 Z" fill="var(--sofa)" stroke="var(--cat-line)" stroke-width="1.5"/>
    <path d="M130,104 Q190,98 250,104" stroke="var(--cat-line)" stroke-width="1" fill="none" opacity=".3"/>
    <rect x="58" y="172" width="8" height="8" fill="var(--wood)"/><rect x="256" y="172" width="8" height="8" fill="var(--wood)"/>`;
}

// ---------- 14-mini-play：玩具與節奏 ----------
export const TOYS: Record<ToyKey, { name: string; air: boolean; desc: string }> = {
  feather: { name: "羽毛逗貓棒", air: true, desc: "在空中飛的羽毛" },
  mouse: { name: "老鼠玩具", air: false, desc: "在地上跑的小老鼠" },
  ribbon: { name: "緞帶逗貓棒", air: false, desc: "在地上扭動的緞帶" },
};
export const RHYTHMS: Record<RhythmKey, { name: string; speed: [number, number]; pause: [number, number] }> = {
  quick: { name: "快快衝、短短停", speed: [350, 950], pause: [0.25, 0.9] },
  slow: { name: "慢慢移動、停久一點", speed: [100, 420], pause: [0.7, 2.2] },
};
function toySVG(kind: ToyKey): string {
  if (kind === "mouse") return `<ellipse cx="0" cy="0" rx="13" ry="8" fill="var(--muted)"/><circle cx="-10" cy="-6" r="4" fill="var(--muted)"/><circle cx="-14" cy="0" r="1.4" fill="var(--cat-line)"/><path d="M12,0 C22,0 24,8 32,6" stroke="var(--muted)" stroke-width="2" fill="none"/>`;
  if (kind === "ribbon") return `<circle cx="0" cy="0" r="4" fill="var(--accent)"/>`;
  return `<path d="M0,0 C-10,8 -12,24 -4,34 C2,24 8,12 0,0 Z" fill="var(--paw)"/><path d="M0,0 C8,10 14,22 8,32" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/><circle cx="0" cy="0" r="4" fill="var(--warn)"/>`;
}

// ---------- 12-mini-core：共用 ----------
interface Mini { root: HTMLElement; raf: number; running: boolean; closed: boolean; done: (r: unknown) => void; last: number }

function svgPt(svg: SVGSVGElement, e: PointerEvent | MouseEvent) {
  const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  const m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 };
}
const byId = (m: Mini, id: string) => m.root.querySelector<SVGElement & HTMLElement>(`#${id}`);
function setBar(m: Mini, id: string, v: number) { const el = byId(m, id); if (el) el.style.width = clamp(v, 0, 100) + "%"; }
function setText(m: Mini, id: string, t: string) { const el = byId(m, id); if (el && el.textContent !== t) el.textContent = t; }
function miniMeter(label: string, id: string, numId: string, cls: string, numText: string, w = 0) {
  return `<div class="meter"><span>${label}</span><div class="bar ${cls}"><i id="${id}" style="width:${w}%"></i></div><span class="num" id="${numId}">${numText}</span></div>`;
}
function miniFrame(title: string, eyebrow: string, hint: string, svg: string, meters: string, extra = "") {
  return `<div class="scrim"><div class="modal mini" role="dialog" aria-modal="true" aria-label="${title}"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2>
    <p class="small muted">${hint}</p>${extra}${svg}<div class="mm">${meters}</div><div id="mmsg" class="mmsg" aria-live="polite"></div>
    <div class="row2"><button type="button" data-m="go" class="solidbtn" id="mgo">開始</button><button type="button" data-m="cancel" id="mcancel">取消</button></div></div></div>`;
}
function liveFrame(title: string, eyebrow: string, hint: string, svg: string, meters: string, doneLabel = "完成", cancelLabel = "取消") {
  return `<div class="scrim"><div class="modal mini" role="dialog" aria-modal="true" aria-label="${title}"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2>
    <p class="small muted">${hint}</p>${svg}<div class="mm">${meters}</div><div id="mmsg" class="mmsg" aria-live="polite"></div>
    <div class="row2">${doneLabel ? `<button type="button" class="solidbtn" id="mdone">${doneLabel}</button>` : ""}${cancelLabel ? `<button type="button" id="mcancel">${cancelLabel}</button>` : ""}</div></div></div>`;
}
/** 結束小遊戲（原版 closeMini＋endCustom／endMini／quitMini）：停掉動畫、清空畫面、回傳結果 */
function end(m: Mini, result: unknown) {
  if (m.closed) return;
  m.closed = true; cancelAnimationFrame(m.raf); m.root.innerHTML = "";
  m.done(result);
}
function bindMiniButtons(m: Mini, onGo: () => void, onStop: () => void, stopLabel = "先到這裡") {
  const go = m.root.querySelector<HTMLButtonElement>("#mgo")!, cancel = m.root.querySelector<HTMLButtonElement>("#mcancel")!;
  go.addEventListener("click", () => {
    go.hidden = true; cancel.textContent = stopLabel; m.running = true;
    const pk = m.root.querySelector<HTMLElement>(".picker"); if (pk) pk.hidden = true;
    onGo();
  });
  // 原版 quitMini：劇情中的小遊戲取消時，劇情照樣往下走（結果是 null）
  cancel.addEventListener("click", () => { if (m.running) onStop(); else end(m, null); });
}
function bindLive(m: Mini, onDone: () => void) {
  const d = m.root.querySelector("#mdone"), c = m.root.querySelector("#mcancel");
  if (d) d.addEventListener("click", onDone);
  if (c) c.addEventListener("click", () => end(m, null));
}
interface Ptr { px: number; py: number; down: boolean; onDown?: () => void; onUp?: () => void }
function trackPointer(el: SVGSVGElement, st: Ptr) {
  const pos = (e: PointerEvent) => { const p = svgPt(el, e); st.px = p.x; st.py = p.y; };
  el.addEventListener("pointerdown", e => { st.down = true; try { el.setPointerCapture(e.pointerId); } catch { /* 不支援時略過 */ } pos(e); if (st.onDown) st.onDown(); });
  el.addEventListener("pointermove", e => { pos(e); });
  const up = () => { st.down = false; if (st.onUp) st.onUp(); };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}
function loopWith(m: Mini, tick: (dt: number) => boolean | void) {
  const step = (ts: number) => {
    if (m.closed) return;
    const dt = Math.min(0.05, (ts - (m.last || ts)) / 1000); m.last = ts;
    if (tick(dt) !== false && !m.closed) m.raf = requestAnimationFrame(step);
  };
  m.raf = requestAnimationFrame(step);
}

// ---------- 23-story-minis：到家第一天躲床底 ----------
function startHide(m: Mini, S: MiniCtx) {
  const st = { wait: 0, need: 7, px: 260, py: 60, down: false, lastPx: 260, lastPy: 60, out: 0, done: false } as Ptr & { wait: number; need: number; lastPx: number; lastPy: number; out: number; done: boolean };
  const svg = `<svg id="hsvg" class="arena" viewBox="0 0 320 220">
    ${bedSVG()}
    <g id="heyes" class="blink"><circle cx="152" cy="150" r="3.2" fill="var(--eye-glow)"/><circle cx="168" cy="150" r="3.2" fill="var(--eye-glow)"/></g>
    <g id="hcat" opacity="0"></g>
    <g id="hhand"><path d="M-10,-14 v22 a10,10 0 0 0 20,0 v-14 M-10,-6 h-6 v10" fill="var(--sand)" stroke="var(--cat-line)" stroke-width="1.5"/></g>
  </svg>`;
  m.root.innerHTML = liveFrame("到家第一天", "故事", "麻糬一下提籃就鑽進床底，黑暗裡只看得到兩顆發亮的眼睛。點床底下，就是伸手進去把牠抓出來；手放著不動、靜靜等，牠可能會自己出來。", svg,
    miniMeter("等待", "hcl", "hc", "paw", ""), "", "");
  const el = m.root.querySelector<SVGSVGElement>("#hsvg")!;
  trackPointer(el, st);
  st.onDown = () => {
    if (st.done) return;
    if (st.px > 58 && st.px < 264 && st.py > 126 && st.py < 172) { st.done = true; setText(m, "mmsg", "你伸手進去，麻糬拼命掙扎、抓了你一下，又縮回更裡面……"); setTimeout(() => end(m, 1), 1600); }
  };
  loopWith(m, dt => {
    const mv = Math.hypot(st.px - st.lastPx, st.py - st.lastPy) / Math.max(dt, 1e-3); st.lastPx = st.px; st.lastPy = st.py;
    byId(m, "hhand")?.setAttribute("transform", `translate(${st.px.toFixed(1)},${st.py.toFixed(1)})`);
    if (st.done && st.out === 0) return;
    if (st.wait < st.need) {
      st.wait += dt * (mv > 200 ? 0.2 : 1);
      setText(m, "mmsg", mv > 200 ? "手晃來晃去，麻糬又往裡面縮了。" : st.wait > st.need * 0.6 ? "麻糬好像往外挪了一點……" : "你坐在地上，安靜地等。");
      setBar(m, "hcl", st.wait / st.need * 100);
      if (st.wait >= st.need && !st.done) { st.done = true; st.out = 0.01; }
    }
    if (st.out > 0) {
      st.out = Math.min(1, st.out + dt * 0.6);
      byId(m, "heyes")?.setAttribute("opacity", String(1 - st.out));
      const k = 0.42 * catScale(S), cat = byId(m, "hcat");
      cat?.setAttribute("opacity", String(Math.min(1, st.out * 2)));
      if (cat) cat.innerHTML = `<g transform="translate(160,${(168 + 28 * st.out).toFixed(1)}) scale(${k.toFixed(3)})" class="wide">${catParts(S)}</g>`;
      setText(m, "mmsg", "麻糬慢慢走出來，在你腳邊聞了聞。");
      if (st.out >= 1) { setTimeout(() => end(m, 0), 900); return false; }
    }
  });
}

// ---------- 19-mini-scoop：鏟屎（劇情裡固定 dirt 70，同原版 expOpenMini） ----------
interface Clump { x: number; y: number; r: number; poop: boolean; st: "sand" | "scoop" | "bag"; rot: number }
function startScoop(m: Mini, S: MiniCtx, dirt = 70) {
  const small = false; // 原版：泌尿風險 ≥ 4 且 6 個月以上才會出現小尿塊；DEMO 第一天的幼貓不會
  const n = dirt < 5 ? 0 : clamp(Math.round(dirt / 12), 1, 8) + (small ? 3 : 0);
  const L: Clump[] = [];
  for (let i = 0; i < n; i++) {
    const poop = !small ? i % 3 === 2 : i % 5 === 4;
    L.push({ x: 55 + Math.random() * 175, y: 92 + Math.random() * 80, r: poop ? 9 : small ? 5 + Math.random() * 2 : 10 + Math.random() * 4, poop, st: "sand", rot: Math.random() * 60 - 30 });
  }
  const st = { L, load: [] as Clump[], px: 150, py: 40, down: false, bagged: 0, total: L.length, lastPx: 150, lastPy: 40, small } as Ptr & { L: Clump[]; load: Clump[]; bagged: number; total: number; lastPx: number; lastPy: number; small: boolean };
  let grains = "";
  for (let i = 0; i < 70; i++) grains += `<circle cx="${(36 + Math.random() * 200).toFixed(1)}" cy="${(78 + Math.random() * 106).toFixed(1)}" r="${(0.8 + Math.random() * 0.9).toFixed(1)}" fill="var(--wood)" opacity=".25"/>`;
  const svg = `<svg id="ssvg" class="arena" viewBox="0 0 320 220">
    <rect x="0" y="0" width="320" height="220" fill="var(--floor)"/>
    <rect x="22" y="62" width="228" height="140" rx="16" fill="var(--litter)" stroke="var(--cat-line)" stroke-width="2"/>
    <rect x="32" y="72" width="208" height="120" rx="10" fill="var(--sand)"/>${grains}
    <g id="sclumps"></g>
    <g transform="translate(288,160)"><path d="M-22,-36 L22,-36 L18,40 L-18,40 Z" fill="var(--muted)" opacity=".85"/><path d="M-22,-36 q22,10 44,0" fill="none" stroke="var(--cat-line)" stroke-width="2"/><text x="0" y="10" font-size="10" text-anchor="middle" fill="var(--card)">垃圾袋</text></g>
    <g id="sscoop"><rect x="-3" y="10" width="6" height="56" rx="3" fill="var(--accent)"/><path d="M-20,-14 L20,-14 L16,12 L-16,12 Z" fill="var(--glass)" stroke="var(--cat-line)" stroke-width="1.5"/>
      <path d="M-12,-8 V6 M-6,-8 V6 M0,-8 V6 M6,-8 V6 M12,-8 V6" stroke="var(--cat-line)" stroke-width="1" opacity=".5"/><g id="sload"></g></g>
  </svg>`;
  m.root.innerHTML = liveFrame("鏟屎", "照顧・砂盆", n ? "按住拖曳貓砂鏟，把結塊鏟起來，再拿到右邊的垃圾袋放開。動作太大，鏟子上的東西會掉回去。" : "砂盆很乾淨，今天還不用鏟。",
    svg, miniMeter("清掉", "scl", "sc", "", `0/${n}`), n ? "" : "好", "放下鏟子");
  const el = m.root.querySelector<SVGSVGElement>("#ssvg")!;
  trackPointer(el, st);
  const clump = (c: Clump, x: string | number, y: string | number) => c.poop
    ? `<ellipse cx="${x}" cy="${y}" rx="${c.r * 1.3}" ry="${c.r * 0.55}" transform="rotate(${c.rot} ${x} ${y})" fill="var(--wood)" stroke="var(--cat-line)" stroke-width="1"/>`
    : `<circle cx="${x}" cy="${y}" r="${c.r}" fill="var(--tartar)" stroke="var(--wood)" stroke-width="1" opacity=".9"/>`;
  const draw = () => {
    byId(m, "sscoop")?.setAttribute("transform", `translate(${st.px.toFixed(1)},${st.py.toFixed(1)})`);
    const cl = byId(m, "sclumps"), ld = byId(m, "sload");
    if (cl) cl.innerHTML = st.L.filter(c => c.st === "sand").map(c => clump(c, c.x.toFixed(1), c.y.toFixed(1))).join("");
    if (ld) ld.innerHTML = st.load.map((c, i) => clump(c, -10 + i * 10, -2)).join("");
    setBar(m, "scl", st.total ? st.bagged / st.total * 100 : 100); setText(m, "sc", `${st.bagged}/${st.total}`);
  };
  st.onUp = () => {
    if (st.px > 262 && st.py > 110 && st.load.length) { st.load.forEach(c => { c.st = "bag"; }); st.bagged += st.load.length; st.load = []; setText(m, "mmsg", "丟進垃圾袋了。"); draw(); }
  };
  const finish = () => end(m, { bagged: st.bagged, total: st.total, small: st.small });
  bindLive(m, finish);
  if (!n) { draw(); return; }
  loopWith(m, dt => {
    const spd = Math.hypot(st.px - st.lastPx, st.py - st.lastPy) / Math.max(dt, 1e-3); st.lastPx = st.px; st.lastPy = st.py;
    if (st.down && st.load.length < 3) {
      for (const c of st.L) if (c.st === "sand" && Math.hypot(c.x - st.px, c.y - st.py) < c.r + 14 && st.load.length < 3) { c.st = "scoop"; st.load.push(c); setText(m, "mmsg", c.poop ? "鏟起一條便便。" : st.small ? "這塊尿塊好小……" : "鏟起一塊尿塊。"); }
    }
    if (st.load.length && spd > 1400) {
      const c = st.load.pop()!; c.st = "sand"; c.x = clamp(st.px, 50, 225); c.y = clamp(st.py, 90, 175); setText(m, "mmsg", "太用力了，掉回去了！");
    }
    if (!st.down && st.load.length && !(st.px > 262 && st.py > 110)) {
      st.load.forEach(c => { c.st = "sand"; c.x = clamp(st.px + Math.random() * 10, 50, 225); c.y = clamp(st.py, 90, 175); }); st.load = []; setText(m, "mmsg", "放開了，東西掉回砂盆裡。");
    }
    draw();
    if (st.bagged >= st.total) {
      setText(m, "mmsg", st.small ? "清乾淨了。今天的尿塊又多又小，要多留意麻糬上廁所的狀況。" : "清乾淨了！");
      setTimeout(finish, 900); return false;
    }
  });
}

// ---------- 14-mini-play：逗貓棒時間 ----------
function startPlay(m: Mini, S: MiniCtx) {
  const C = S.cat;
  const speed = S.age < 12 ? 150 : S.age >= 132 ? 75 : 115;
  const k = 0.6 * catScale(S);
  const owned = S.toys;
  const st = { toy: owned[0], cx: 70, cy: 210, dir: 1, tx: 220, ty: 90, ptx: 220, pty: 90, spd: 0, idle: 0, fun: 0, interest: 60, p: null as null | { k: number; x0: number; y0: number; x1: number; y1: number },
    hold: 0, cool: 1, t: 0, T: 20, speed, k, jump: S.age >= 132 ? 30 : 60, say: "", sayT: 0, band: 0, total: 0, cueT: 0, cue: "", trail: [] as [number, number][], look: 0 };
  const picker = `<div class="picker"><span class="small muted">選一個玩具：</span>${owned.map(t => `<button type="button" class="pk" data-toy="${t}" aria-pressed="${t === st.toy}">${TOYS[t].name}</button>`).join("")}${owned.length < 3 ? `<span class="small muted">（商店還有別的玩具）</span>` : ""}</div>`;
  const svg = `<svg id="psvg" class="arena" viewBox="0 0 360 240">
    <rect x="0" y="0" width="360" height="150" fill="var(--wall)"/><rect x="0" y="150" width="360" height="90" fill="var(--floor)"/><rect x="0" y="146" width="360" height="5" fill="var(--wood)"/>
    <ellipse id="pshadow" cx="70" cy="214" rx="26" ry="5" fill="var(--shadow)" opacity=".25"/>
    <g id="pcat" transform="translate(70,210)"><g id="pcatin" class="${catMood(S)}" transform="scale(${k},${k})">${catParts(S)}</g></g>
    <polyline id="ptrail" points="" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <line id="pstring" x1="220" y1="0" x2="220" y2="90" stroke="var(--muted)" stroke-width="1.5"/>
    <g id="ptoy" transform="translate(220,90)">${toySVG(st.toy)}</g>
    <text id="psay" x="70" y="140" font-size="14" fill="var(--paw)" text-anchor="middle" font-weight="700"></text>
  </svg>`;
  m.root.innerHTML = miniFrame("逗貓棒時間", "單次行動",
    "移動手指或滑鼠操控玩具。每隻貓喜歡的玩具和節奏不一樣，看麻糬的反應來調整：瞳孔放大、屁股扭動代表牠很有興趣；轉頭理毛代表不對味。",
    svg, miniMeter("開心度", "pfl", "pf", "paw", "0") + miniMeter("興致", "pil", "pt", "", "20 秒", 60), picker);
  m.root.querySelectorAll<HTMLButtonElement>(".pk").forEach(b => b.addEventListener("click", () => {
    st.toy = b.dataset.toy as ToyKey; m.root.querySelectorAll(".pk").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    const toy = byId(m, "ptoy"); if (toy) toy.innerHTML = toySVG(st.toy);
  }));
  const el = m.root.querySelector<SVGSVGElement>("#psvg")!;
  const pos = (e: PointerEvent) => { const p = svgPt(el, e); st.tx = clamp(p.x, 16, 344); st.ty = clamp(p.y, TOYS[st.toy].air ? 24 : 186, 226); };
  el.addEventListener("pointerdown", e => { if (!m.running) return; try { el.setPointerCapture(e.pointerId); } catch { /* 略過 */ } pos(e); });
  el.addEventListener("pointermove", e => { if (m.running) pos(e); });
  const say = (t: string) => { st.say = t; st.sayT = 1.1; };
  const R = RHYTHMS[C.rhythm], match = () => st.toy === C.toyPref;
  const result = () => ({ fun: st.fun, toy: st.toy, match: match(), rhythmOk: st.band / Math.max(1, st.total) > 0.5 });
  bindMiniButtons(m, () => {
    if (!TOYS[st.toy].air) { st.ty = 205; st.pty = 205; }
    loopWith(m, dt => {
      st.t += dt; st.cool -= dt; st.cueT -= dt;
      const inst = Math.hypot(st.tx - st.ptx, st.ty - st.pty) / Math.max(dt, 1e-3);
      st.ptx = st.tx; st.pty = st.ty;
      st.spd = st.spd * 0.85 + inst * 0.15;
      st.idle = st.spd < 30 ? st.idle + dt : 0;
      const moving = st.spd >= 30;
      const inBand = moving ? (st.spd >= R.speed[0] && st.spd <= R.speed[1]) : st.idle <= R.pause[1];
      st.total += dt; if (inBand) st.band += dt;
      const mm = (match() ? 1.5 : 0.55) * (inBand ? 1.3 : 0.7);
      let crouch = false;
      if (st.p) {
        st.p.k += dt / 0.4;
        const q = Math.min(1, st.p.k);
        st.cx = st.p.x0 + (st.p.x1 - st.p.x0) * q;
        st.cy = st.p.y0 + (st.p.y1 - st.p.y0) * q - Math.sin(Math.PI * q) * (TOYS[st.toy].air ? st.jump : st.jump * 0.4);
        if (q >= 1) {
          const caught = Math.hypot(st.tx - st.p.x1, st.ty - st.p.y1) < 40;
          if (caught) { st.fun += 13 * mm; st.hold = 0.7; say("抓到了！"); } else { st.fun += 3 * mm; say("撲空了！"); }
          st.p = null; st.cool = 1.1;
        }
      } else if (st.hold > 0) {
        st.hold -= dt;
      } else {
        const gy = clamp(st.ty + 20, 168, 215), dx = st.tx - st.cx, dy = gy - st.cy, d = Math.hypot(dx, dy);
        const sp = st.speed * (match() ? 1 : 0.6);
        if (st.spd > 1100) { st.interest -= 25 * dt; if (st.sayT <= 0) say("太快了，跟不上"); }
        else if (st.idle > 3) { st.interest -= 8 * dt; if (st.sayT <= 0) say("好無聊……"); }
        else {
          if (d > 30) { st.cx += dx / d * sp * dt; st.cy += dy / d * sp * dt; }
          if (moving) { st.fun += 3 * dt * st.interest / 100 * mm; st.interest = clamp(st.interest + (match() ? 5 : -5) * dt, 0, 100); }
        }
        crouch = st.idle > 0.2 && st.cool <= 0;
        if (Math.hypot(st.tx - st.cx, st.ty - st.cy) < 140 && st.idle >= R.pause[0] && st.idle <= R.pause[1] && st.cool <= 0 && st.interest > 15)
          st.p = { k: 0, x0: st.cx, y0: st.cy, x1: st.tx, y1: Math.max(st.ty + 22, st.cy - st.jump * 2.2) };
      }
      let mood = "";
      if (st.cueT <= 0 && st.t > 2) {
        st.cueT = 2.2;
        if (mm >= 1.4) st.cue = "good"; else if (mm < 0.6) st.cue = "bad"; else st.cue = "";
      }
      if (st.cue === "good") { mood = "wide"; if (st.cueT > 2.1) setText(m, "mmsg", "麻糬的瞳孔放大了，屁股扭個不停！"); }
      else if (st.cue === "bad") { st.look = 1; if (st.cueT > 2.1) setText(m, "mmsg", match() ? "麻糬好像有點跟不上這個節奏……" : "麻糬看了一眼，就轉頭去理毛了。"); }
      else if (st.cueT > 2.1) setText(m, "mmsg", "");
      if (Math.abs(st.tx - st.cx) > 6) st.dir = st.tx > st.cx ? 1 : -1;
      const faceDir = st.cue === "bad" && !st.p ? -st.dir : st.dir;
      st.interest = clamp(st.interest, 0, 100); st.fun = clamp(st.fun, 0, 100); st.sayT -= dt;
      // 繪製
      byId(m, "pcat")?.setAttribute("transform", `translate(${st.cx.toFixed(1)},${st.cy.toFixed(1)})`);
      const ci = byId(m, "pcatin");
      ci?.setAttribute("transform", `scale(${(faceDir * st.k).toFixed(3)},${(st.k * (crouch ? 0.86 : 1)).toFixed(3)})`);
      ci?.setAttribute("class", (st.hold > 0 ? "purr " : "") + mood);
      byId(m, "pshadow")?.setAttribute("cx", st.cx.toFixed(1));
      byId(m, "ptoy")?.setAttribute("transform", `translate(${st.tx.toFixed(1)},${st.ty.toFixed(1)})`);
      const sl = byId(m, "pstring");
      if (sl) {
        if (TOYS[st.toy].air) { sl.setAttribute("x1", st.tx.toFixed(1)); sl.setAttribute("y1", "0"); }
        else { sl.setAttribute("x1", (st.tx + 50).toFixed(1)); sl.setAttribute("y1", (st.ty - 80).toFixed(1)); }
        sl.setAttribute("x2", st.tx.toFixed(1)); sl.setAttribute("y2", st.ty.toFixed(1));
      }
      if (st.toy === "ribbon") {
        st.trail.unshift([st.tx, st.ty + Math.sin(st.t * 14) * 3]); if (st.trail.length > 14) st.trail.pop();
        byId(m, "ptrail")?.setAttribute("points", st.trail.map(p => p.map(v => v.toFixed(1)).join(",")).join(" "));
      }
      const sy = byId(m, "psay");
      if (sy) { sy.setAttribute("x", st.cx.toFixed(1)); sy.setAttribute("y", (st.cy - 70 * catScale(S) - 8).toFixed(1)); sy.textContent = st.sayT > 0 ? st.say : ""; }
      setBar(m, "pfl", st.fun); setText(m, "pf", String(Math.round(st.fun)));
      setBar(m, "pil", st.interest); setText(m, "pt", Math.max(0, Math.ceil(st.T - st.t)) + " 秒");
      if (st.t >= st.T) { end(m, result()); return false; }
    });
  }, () => end(m, result()));
}

const STARTERS: Record<MiniId, (m: Mini, S: MiniCtx) => void> = { hide: startHide, scoop: startScoop, play: startPlay };

/** 在 root 裡開一個小遊戲；回傳停止函式（元件卸載時呼叫，不會回傳結果） */
export function startMini(id: MiniId, root: HTMLElement, ctx: MiniCtx, onDone: (r: unknown) => void): () => void {
  const m: Mini = { root, raf: 0, running: id !== "play", closed: false, done: onDone, last: 0 };
  STARTERS[id](m, ctx);
  return () => { if (!m.closed) { m.closed = true; cancelAnimationFrame(m.raf); root.innerHTML = ""; } };
}
