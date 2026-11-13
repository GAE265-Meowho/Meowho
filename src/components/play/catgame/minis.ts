// 虛擬飼養 DEMO（#237）：catgame 原版的小遊戲，搬自團隊專題專案 catgame/src（12-mini-core、14-mini-play、19-mini-scoop、23-story-minis、
// 10-cat-drawing）。玩法、判定、提示文字照原版；原版是 vanilla JS 直接操作 DOM，這裡保留同樣的寫法，只改成：
//   - 畫在呼叫端給的 root 裡（不用全域的 #mini），id 一律在 root 裡找
//   - 原版的全域狀態 S（貓的年紀、信任、壓力、喜歡的玩具與節奏）改成參數 ctx
//   - 結束時呼叫 onDone(結果)，結果格式同原版（hide：0 等牠出來／1 硬抓；scoop：{ bagged, total, small }；play：{ fun, toy, match, rhythmOk }）
// 用到的原版共用函式：liveFrame、miniFrame、bindMiniButtons、bindLive、trackPointer、loopWith、miniMeter、setBar、setText、svgPt、
// catParts、catScale、catMood、bedSVG、toySVG。樣式在 catgame.module.css（原版 style 的對應段落）。
// 只在瀏覽器執行（PlayGame 的 client component 裡呼叫）。


/** 原版 S 裡小遊戲用得到的欄位 */
export interface MiniCtx {
  /** 幾個月大 */
  age: number;
  cat: { body: number; trust: number; stress: number; /** 虎斑才畫條紋；沒給＝畫 */ tabby?: boolean };
  /** 以下選填，沒給就用原版預設：結紮、刷牙訓練階段（0~5）、牙齒狀況、指甲長度（0~100）、剪指甲訓練階段、外出籠訓練階段 */
  touchFav?: "head" | "chin" | "back" | null;
  neutered?: boolean; brushLevel?: number; dental?: number; nails?: number; nailLevel?: number; carrierLevel?: number;
}

/** 小遊戲。逗貓在掃描房間是 3D（ScanWand），不在這裡 */
export type MiniId = "scoop" | "pet" | "feed" | "water" | "nail" | "brush" | "carrier";

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
      ${s.cat.tabby === false ? "" : TABBY}
      <g class="eyes-open blink" stroke="none"><ellipse cx="-10" cy="-94" rx="3.2" ry="5" fill="var(--cat-line)"/><ellipse cx="10" cy="-94" rx="3.2" ry="5" fill="var(--cat-line)"/></g>
      <g class="eyes-wide" stroke="none"><circle cx="-10" cy="-94" r="6.5" fill="var(--cat-line)"/><circle cx="10" cy="-94" r="6.5" fill="var(--cat-line)"/><circle cx="-8" cy="-96.5" r="2.2" fill="var(--fur)"/><circle cx="12" cy="-96.5" r="2.2" fill="var(--fur)"/></g>
      <g class="eyes-closed"><path d="M-15,-93 q5,-6 10,0 M5,-93 q5,-6 10,0" fill="none" stroke-width="3" stroke-linecap="round"/></g>
      <path d="M-3,-84 L3,-84 L0,-80 Z" fill="var(--paw)" stroke="none"/>
      <path d="M-6,-77 q6,4 6,-2 q0,6 6,2" fill="none" stroke-width="1.8"/>
      <path d="M-14,-82 L-34,-85 M-14,-79 L-33,-76 M14,-82 L34,-85 M14,-79 L33,-76" stroke-width="1.2" opacity=".55"/>
    </g></g>`;
}
/** 虎斑：在原版的貓頭和身上加幾道條紋（顏色 --stripe）；花色不是虎斑的貓不畫（ctx.cat.tabby） */
const TABBY = `<g stroke="var(--stripe)" stroke-width="3" stroke-linecap="round" fill="none" opacity=".75">
  <path d="M-8,-120 L-6,-110 M0,-122 L0,-111 M8,-120 L6,-110"/><path d="M-26,-50 q8,4 14,0 M-28,-34 q8,4 14,0 M26,-50 q-8,4 -14,0 M28,-34 q-8,4 -14,0"/></g>`;
export function catMood(s: Pick<MiniCtx, "cat">): string {
  const C = s.cat;
  return [C.trust > 65 && C.stress < 40 ? "purr" : "", C.stress > 60 ? "flat wide" : ""].join(" ").trim();
}
export const catScale = (s: Pick<MiniCtx, "age">) => (s.age < 12 ? 0.68 + 0.32 * (s.age - 2) / 10 : 1);


// ---------- 12-mini-core：共用 ----------
interface Mini { root: HTMLElement; raf: number; running: boolean; closed: boolean; done: (r: unknown) => void; last: number }

function svgPt(svg: SVGSVGElement, e: PointerEvent | MouseEvent) {
  const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  const m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 };
}
type El = Omit<SVGElement & HTMLElement, "setAttribute"> & { setAttribute(name: string, value: string | number): void };
const byId = (m: Mini, id: string) => m.root.querySelector(`#${id}`) as unknown as El | null;
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
interface Ptr { px: number; py: number; down: boolean; downX?: number; downY?: number; onDown?: (e: PointerEvent) => void; onUp?: () => void }
function trackPointer(el: SVGSVGElement, st: Ptr) {
  const pos = (e: PointerEvent) => { const p = svgPt(el, e); st.px = p.x; st.py = p.y; };
  el.addEventListener("pointerdown", e => { st.down = true; try { el.setPointerCapture(e.pointerId); } catch { /* 不支援時略過 */ } pos(e); st.downX = st.px; st.downY = st.py; if (st.onDown) st.onDown(e); });
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

// ---------- 搬自原版：放飯（20-mini-feed）、換水（21-mini-water）、剪指甲（22-mini-nail）、刷牙（13-mini-brush）、外出籠（16-mini-carrier） ----------
/* eslint-disable @typescript-eslint/no-explicit-any -- 原版小遊戲的狀態 st 欄位很多、隨玩法變化，沿用 vanilla 寫法 */
type St = Ptr & Record<string, any>;
interface Part { x: number; y: number; vy: number }
interface Claw { x: number; y: number; ext: boolean; cut: string | null; len: number }
const BRUSH_LEVELS = [["碰不得"], ["可以摸嘴邊"], ["可以翻嘴唇"], ["願意舔牙膏"], ["指套刷牙"], ["牙刷全口"]];
const BRUSH_MODES = [
  { key: "touch", title: "碰碰嘴邊", hint: "按住圓圈，用手指輕碰麻糬的嘴角，累積 6 秒。麻糬的頭會一直晃，轉頭時也要跟著移動，耳朵往後壓就先放開。", goal: "讓麻糬習慣被碰嘴巴" },
  { key: "lift", title: "翻開嘴唇", hint: "按住嘴唇往上拉，讓牙齒露出來，累積撐住 4 秒半。牠會一直轉頭。拉太久麻糬會不耐煩。", goal: "讓麻糬習慣被翻嘴唇" },
  { key: "paste", title: "嚐嚐牙膏", hint: "手指沾了寵物牙膏。慢慢靠近麻糬的鼻子，停在牠面前不動，等牠自己來舔。動作太快會嚇到牠。需要舔 3 次。", goal: "讓麻糬接受牙膏的味道" },
  { key: "finger", title: "指套刷牙", hint: "按住拖曳指套，刷掉前面 4 顆牙上的黃色牙垢。麻糬開始甩頭時先放開。", goal: "用指套刷前面的牙" },
  { key: "brush", title: "牙刷刷牙", hint: "按住拖曳牙刷，把 6 顆牙都刷乾淨，兩側後面的牙也要刷到。麻糬開始甩頭時先放開。", goal: "用牙刷刷全口" }
];

function startFeed(m: Mini, S: MiniCtx) {
  const C = S.cat;
  const portion = Math.round(35 * (S.neutered ? 0.8 : 1) * (C.body >= 7 ? 0.85 : 1));
  const st: St = { amount: 0, start: 0, portion, drag: null, px: 160, py: 40, down: false, last: 0, open: { wet: false, soup: false }, used: { wet: false, soup: false }, wet: false, soup: false, hover: 0, particles: [], spill: 0 };
  const BX = 210, BY = 186;
  const svg = `<svg id="fsvg" class="arena" viewBox="0 0 320 230">
    <rect x="0" y="0" width="320" height="150" fill="var(--wall)"/><rect x="0" y="150" width="320" height="80" fill="var(--floor)"/>
    <rect x="12" y="44" width="92" height="6" rx="2" fill="var(--wood)"/><rect x="12" y="120" width="92" height="6" rx="2" fill="var(--wood)"/>
    <text x="58" y="138" font-size="10" text-anchor="middle" fill="var(--muted)">乾飼料</text><text x="35" y="64" font-size="10" text-anchor="middle" fill="var(--muted)">主食罐</text><text x="82" y="64" font-size="10" text-anchor="middle" fill="var(--muted)">湯罐</text>
    <g transform="translate(${BX},${BY})"><ellipse cx="0" cy="14" rx="56" ry="10" fill="var(--shadow)" opacity=".2"/><path d="M-52,-10 Q-48,18 0,18 Q48,18 52,-10 Z" fill="var(--wood)" stroke="var(--cat-line)" stroke-width="2"/>
      <ellipse cx="0" cy="-10" rx="52" ry="10" fill="var(--wood)" stroke="var(--cat-line)" stroke-width="2"/><g id="ffood"></g>
      <line id="fline" x1="-44" x2="44" y1="0" y2="0" stroke="var(--paw)" stroke-width="1.5" stroke-dasharray="4 3"/><text id="flabel" x="56" y="0" font-size="10" fill="var(--paw)">建議份量</text></g>
    <g id="fparts"></g>
    <g id="fbag" data-it="dry"><path d="M-18,-28 L18,-28 L22,30 L-22,30 Z" fill="var(--warn)" stroke="var(--cat-line)" stroke-width="1.5"/><path d="M-18,-28 L18,-28" stroke="var(--cat-line)" stroke-width="3"/><circle cx="0" cy="4" r="9" fill="var(--card)"/><path d="M-4,2 q4,-5 8,0 q-4,6 -8,0" fill="var(--warn)"/></g>
    <g id="fwet" data-it="wet"><rect x="-14" y="-12" width="28" height="22" rx="4" fill="var(--accent)" stroke="var(--cat-line)" stroke-width="1.5"/><ellipse id="fwetlid" cx="0" cy="-12" rx="14" ry="4" fill="var(--glass)" stroke="var(--cat-line)" stroke-width="1"/><circle id="fwettab" cx="8" cy="-13" r="3" fill="var(--muted)"/></g>
    <g id="fsoup" data-it="soup"><rect x="-10" y="-10" width="20" height="18" rx="4" fill="var(--paw)" stroke="var(--cat-line)" stroke-width="1.5"/><ellipse id="fsouplid" cx="0" cy="-10" rx="10" ry="3" fill="var(--glass)" stroke="var(--cat-line)" stroke-width="1"/><circle id="fsouptab" cx="5" cy="-11" r="2.4" fill="var(--muted)"/></g>
  </svg>`;
  m.root.innerHTML = liveFrame("放飯", "照顧・飯碗",
    `把飼料袋拖到碗上方停住，飼料就會倒出來，倒到虛線就差不多了。罐頭要先點一下拉開拉環，再拖到碗上方。${S.neutered ? "結紮後熱量需求比較低，建議份量也比較少。" : ""}`,
    svg, miniMeter("碗裡", "fcl", "fc", "", "0"), "放好了");
  const home: Record<string, number[]> = { dry: [58, 94], wet: [35, 82], soup: [82, 84] };
  const items: Record<string, string> = { dry: "fbag", wet: "fwet", soup: "fsoup" };
  const pos: Record<string, number[]> = { dry: [...home.dry], wet: [...home.wet], soup: [...home.soup] };
  const el = m.root.querySelector<SVGSVGElement>("#fsvg")!;
  trackPointer(el, st);
  st.onDown = () => {
    for (const k of ["dry", "wet", "soup"]) {
      if (st.used[k]) continue;
      const [x, y] = pos[k];
      if (Math.abs(st.px - x) < 26 && Math.abs(st.py - y) < 32) { st.drag = k; st.hover = 0; return; }
    }
  };
  st.onUp = () => {
    const k = st.drag;
    if (k && k !== "dry" && !st.open[k] && Math.hypot(st.px - st.downX!, st.py - st.downY!) < 8) { st.open[k] = true; setText(m, "mmsg", k === "wet" ? "啪！罐頭打開了。" : "湯罐打開了。"); }
    if (k) { pos[k] = [...home[k]]; }
    st.drag = null;
  };
  const overBowl = () => Math.abs(st.px - BX) < 52 && st.py > 80 && st.py < BY - 6;
  const finish = () => end(m, { added: Math.max(0, st.amount - st.start), over: st.amount - st.start > st.portion * 1.5, wet: st.wet, soup: st.soup, spill: st.spill });
  bindLive(m, finish);
  loopWith(m, dt => {
    const k = st.drag;
    if (k && st.down) pos[k] = [st.px, st.py];
    let tilt = 0;
    if (k === "dry" && st.down) {
      tilt = st.py < BY - 20 ? 70 : 0;
      if (tilt) {
        if (Math.random() < dt * 40) st.particles.push({ x: st.px - 18 + Math.random() * 6, y: st.py + 4, vy: 40 });
        if (overBowl()) st.amount = Math.min(100, st.amount + 22 * dt); else st.spill += dt;
      }
    } else if ((k === "wet" || k === "soup") && st.down && st.open[k]) {
      if (overBowl()) {
        st.hover += dt; tilt = 100;
        if (st.hover > 0.7) {
          st.amount = Math.min(100, st.amount + (k === "wet" ? 30 : 10)); st.used[k] = true; st[k] = true;
          st.drag = null; setText(m, "mmsg", k === "wet" ? "濕食倒進碗裡了，裡面也有很多水分。" : "加了一點湯，可以多補一些水分。");
        }
      } else st.hover = 0;
    }
    st.particles.forEach((p: Part) => { p.vy += 600 * dt; p.y += p.vy * dt; });
    st.particles = st.particles.filter((p: Part) => p.y < (Math.abs(p.x - BX) < 52 ? BY - 12 : 215));
    // draw
    for (const kk of ["dry", "wet", "soup"]) {
      const g = byId(m, items[kk])!; const [x, y] = pos[kk];
      g.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${kk === st.drag ? tilt : 0})`);
      g.setAttribute("opacity", st.used[kk] ? 0.25 : 1);
    }
    ["wet", "soup"].forEach(kk => { const lid = byId(m, `f${kk}lid`)!, tab = byId(m, `f${kk}tab`)!; if (st.open[kk]) { lid.setAttribute("transform", "translate(0,-8) rotate(-30)"); tab.setAttribute("opacity", 0); } });
    byId(m, "fparts")!.innerHTML = st.particles.map((p: Part) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.4" fill="var(--warn)"/>`).join("");
    const lvl = st.amount / 100;
    const fillTop = -10 + 16 * (1 - lvl);
    byId(m, "ffood")!.innerHTML = st.amount > 1 ? `<ellipse cx="0" cy="${(fillTop + 6).toFixed(1)}" rx="${(20 + 28 * lvl).toFixed(1)}" ry="${(3 + 5 * lvl).toFixed(1)}" fill="${st.wet ? "var(--paw)" : st.soup ? "var(--tartar)" : "var(--warn)"}"/>` : "";
    const target = Math.min(100, st.start + st.portion) / 100;
    const ly = (-10 + 16 * (1 - target) + 6).toFixed(1);
    byId(m, "fline")!.setAttribute("y1", ly); byId(m, "fline")!.setAttribute("y2", ly); byId(m, "flabel")!.setAttribute("y", ly);
    setBar(m, "fcl", st.amount); setText(m, "fc", String(Math.round(st.amount)));
    const added = st.amount - st.start;
    if (k === "dry" && st.down && tilt) setText(m, "mmsg", added > st.portion * 1.5 ? "太多了！再倒下去麻糬會變胖。" : added >= st.portion * 0.8 ? "差不多到線了。" : overBowl() ? "沙沙沙……" : "倒到碗外面了！");
  });
}

function startWater(m: Mini) {
  const src = { fresh: 40, level: 60 }, fountain = false as boolean;
  const st: St = { step: "dump", bx: 230, by: 176, px: 230, py: 176, down: false, grab: false, scrub: 0, fill: 0, last: 0, lastPx: 0, lastPy: 0, dirt: 1 - src.fresh / 100, filling: false, water: src.level };
  const SINK = { x: 80, y: 150 };
  const steps: Record<string, string> = fountain
    ? { dump: "拆下飲水機的水箱，拖到水槽把舊水倒掉。", scrub: "在水箱裡來回刷，把黏滑的水垢和濾網上的毛刷掉。", fill: "按住水龍頭裝水，裝到線就放開。", back: "把水箱拖回原來的位置裝好。" }
    : { dump: "把水碗拖到水槽，把舊水倒掉。", scrub: "在碗裡來回搓洗，把毛和灰塵洗掉。", fill: "按住水龍頭裝水，裝到線就放開。", back: "把水碗拖回原來的位置。" };
  let hairs = "";
  for (let k = 0; k < 9; k++) hairs += `<path d="M${-24 + Math.random() * 44},${-6 + Math.random() * 6} q${4 + Math.random() * 4},-3 ${8 + Math.random() * 6},0" stroke="var(--cat-line)" stroke-width=".9" fill="none"/>`;
  const svg = `<svg id="wsvg" class="arena" viewBox="0 0 320 230">
    <rect x="0" y="0" width="320" height="160" fill="var(--wall)"/><rect x="0" y="160" width="320" height="70" fill="var(--floor)"/>
    <rect x="20" y="118" width="130" height="16" rx="4" fill="var(--glass)" stroke="var(--cat-line)" stroke-width="1.5"/><path d="M34,134 h102 l-8,36 h-86 Z" fill="var(--glass)" stroke="var(--cat-line)" stroke-width="1.5"/>
    <g id="wtap" data-tap="1"><path d="M74,118 V72 H104 V84" fill="none" stroke="var(--muted)" stroke-width="8" stroke-linecap="round"/><rect x="62" y="58" width="24" height="12" rx="4" fill="var(--accent)"/><text x="74" y="52" font-size="10" text-anchor="middle" fill="var(--muted)">水龍頭</text></g>
    <rect id="wstream" x="101" y="88" width="6" height="0" fill="var(--water)" opacity=".8"/>
    <ellipse cx="230" cy="188" rx="40" ry="8" fill="var(--shadow)" opacity=".15"/><text x="230" y="212" font-size="10" text-anchor="middle" fill="var(--muted)">原本的位置</text>
    <g id="wbowl"><path d="M-30,-8 Q-28,12 0,12 Q28,12 30,-8 Z" fill="${fountain ? "var(--tooth)" : "var(--tooth)"}" stroke="var(--cat-line)" stroke-width="2"/>
      <ellipse cx="0" cy="-8" rx="30" ry="7" fill="var(--card)" stroke="var(--cat-line)" stroke-width="2"/><ellipse id="wwater" cx="0" cy="-8" rx="26" ry="5.5" fill="var(--water)"/>
      <line x1="-22" x2="22" y1="-5" y2="-5" stroke="var(--paw)" stroke-width="1" stroke-dasharray="3 2"/><g id="whair" opacity="${st.dirt.toFixed(2)}">${hairs}</g><g id="wfoam"></g></g>
  </svg>`;
  m.root.innerHTML = liveFrame(fountain ? "清洗飲水機" : "換水", "照顧・水碗", steps.dump, svg, miniMeter("步驟", "wcl", "wc", "", "1/4"), "", "放著不管");
  const el = m.root.querySelector<SVGSVGElement>("#wsvg")!;
  trackPointer(el, st);
  st.onDown = () => {
    if ((st.step === "dump" || st.step === "back") && Math.hypot(st.px - st.bx, st.py - st.by) < 40) st.grab = true;
    if (st.step === "fill" && st.px > 55 && st.px < 115 && st.py > 50 && st.py < 125) st.filling = true;
  };
  st.onUp = () => {
    if (st.grab && st.step === "dump" && st.px < 150 && st.py < 180) { st.step = "scrub"; st.bx = SINK.x; st.by = SINK.y; st.water = 0; setText(m, "mmsg", "嘩啦——舊水倒掉了。"); }
    else if (st.grab && st.step === "back" && Math.hypot(st.px - 230, st.py - 176) < 45) { st.bx = 230; st.by = 176; st.grab = false; st.step = "done"; }
    else if (st.grab) { st.bx = st.step === "back" ? SINK.x : 230; st.by = st.step === "back" ? SINK.y : 176; }
    st.grab = false;
    if (st.filling) { st.filling = false; if (st.fill >= 70) { st.step = "back"; setText(m, "mmsg", st.fill > 105 ? "裝太滿，灑出來了一點。" : "裝好了。"); } }
  };
  loopWith(m, dt => {
    const mv = Math.hypot(st.px - st.lastPx, st.py - st.lastPy); st.lastPx = st.px; st.lastPy = st.py;
    if (st.grab) { st.bx = st.px; st.by = st.py; }
    if (st.step === "scrub" && st.down && Math.hypot(st.px - st.bx, st.py - st.by) < 34) {
      st.scrub += mv; st.dirt = Math.max(0, st.dirt - mv / 1400);
      if (st.scrub > 1100) { st.step = "fill"; setText(m, "mmsg", "洗乾淨了！"); }
    }
    if (st.step === "fill" && st.filling) st.fill = Math.min(115, st.fill + 45 * dt);
    if (st.step === "fill") st.water = st.fill;
    // draw
    byId(m, "wbowl")!.setAttribute("transform", `translate(${st.bx.toFixed(1)},${st.by.toFixed(1)}) ${st.grab && st.step === "dump" && st.px < 150 ? "rotate(-50)" : ""}`);
    const w = byId(m, "wwater")!; w.setAttribute("rx", (26 * Math.min(1, st.water / 100)).toFixed(1)); w.setAttribute("opacity", st.water > 2 ? 1 : 0);
    w.setAttribute("fill", st.step === "dump" && st.dirt > 0.6 ? "var(--tartar)" : "var(--water)");
    byId(m, "whair")!.setAttribute("opacity", st.dirt.toFixed(2));
    byId(m, "wfoam")!.innerHTML = st.step === "scrub" && st.down ? `<circle cx="-10" cy="-10" r="4" fill="var(--card)" opacity=".8"/><circle cx="6" cy="-12" r="3" fill="var(--card)" opacity=".8"/><circle cx="14" cy="-8" r="3.5" fill="var(--card)" opacity=".8"/>` : "";
    byId(m, "wstream")!.setAttribute("height", st.filling ? 60 : 0);
    const idx = ({ dump: 1, scrub: 2, fill: 3, back: 4, done: 4 } as Record<string, number>)[st.step];
    setBar(m, "wcl", idx / 4 * 100); setText(m, "wc", `${idx}/4`);
    const hint = m.root.querySelector(".modal .small")!; const want = steps[st.step] || "";
    if (want && hint.textContent !== want) hint.textContent = want;
    if (st.step === "fill") setText(m, "mmsg", st.fill > 105 ? "要滿出來了！" : st.fill >= 80 ? "到線了，可以放開。" : st.filling ? "嘩啦啦……" : "");
    if (st.step === "done") { setText(m, "mmsg", "放好了。"); setTimeout(() => end(m, { fill: Math.min(100, st.fill) }), 500); return false; }
  });
  bindLive(m, () => {});
}

function startNail(m: Mini, S: MiniCtx) {
  const C = S.cat, sleepy = false as boolean;
  const lv = S.nailLevel ?? 0;
  const len = 16 + (S.nails ?? 50) * 0.2;
  const toes = [[96, 92], [128, 74], [160, 68], [192, 74], [224, 92]];
  const st: St = { claws: toes.map(([x, y]) => ({ x, y, ext: false, cut: null, len })), t: 0, T: 30, resist: 0, px: 160, py: 200, down: false, last: 0,
    rise: clamp(10 - lv * 1.2 - (C.trust - 50) * 0.05, 3, 14) * (sleepy ? 0.5 : 1), pulled: 0, nextPull: 3, bleed: false, msg: "" };
  const svg = `<svg id="nsvg" class="arena" viewBox="0 0 320 230">
    <rect x="0" y="0" width="320" height="230" fill="var(--soft)"/>
    <g id="npaw"><path d="M110,230 C110,170 100,140 160,130 C220,140 210,170 210,230 Z" fill="var(--fur)" stroke="var(--cat-line)" stroke-width="2.5"/>
      <ellipse cx="160" cy="128" rx="74" ry="44" fill="var(--fur)" stroke="var(--cat-line)" stroke-width="2.5"/>
      <path d="M134,140 Q160,118 186,140 Q182,160 160,160 Q138,160 134,140 Z" fill="var(--paw)" opacity=".85"/>
      <g id="nclaws"></g>
      ${toes.map(([x, y], i) => `<ellipse cx="${x}" cy="${y + 22}" rx="15" ry="13" fill="var(--fur)" stroke="var(--cat-line)" stroke-width="2"/><ellipse class="toe" data-toe="${i}" cx="${x}" cy="${y + 26}" rx="11" ry="8" fill="var(--paw)" fill-opacity=".55"/>`).join("")}
    </g>
    <g id="nclip"><path d="M-6,0 L-14,40 M6,0 L14,40" stroke="var(--muted)" stroke-width="5" stroke-linecap="round"/><path d="M-6,0 Q0,-12 6,0" fill="none" stroke="var(--cat-line)" stroke-width="3"/><circle cx="0" cy="-3" r="2" fill="var(--bad)"/></g>
  </svg>`;
  m.root.innerHTML = miniFrame("剪指甲", `訓練 Lv.${lv}${sleepy ? "・麻糬正在打瞌睡，比較好剪" : ""}`,
    "點粉紅色的肉球，把指甲推出來，再把指甲剪的紅點對準白色尖端點下去。指甲根部粉紅色的是血管，剪到會流血。麻糬要抽腳的時候先停一下。",
    svg, miniMeter("剪好", "ncl", "nc", "", "0/5") + miniMeter("麻糬的忍耐", "nrs", "nt", "low", "30 秒", 100));
  const el = m.root.querySelector<SVGSVGElement>("#nsvg")!;
  trackPointer(el, st);
  const score = () => st.claws.reduce((a: number, c: Claw) => a + (c.cut == null ? 0 : c.cut === "good" ? 1 : 0.5), 0) / 5;
  const finish = (bitten: boolean, ran: boolean) => end(m, { score: Math.round(score() * 100), bitten, ran, bleed: st.bleed });
  st.onDown = (e: PointerEvent) => {
    if (!m.running || st.pulledT > 0) return;
    const toe = (e.target as Element).closest("[data-toe]") as HTMLElement | null;
    if (toe) { const c = st.claws[+toe.dataset.toe!]; if (c.cut == null) { c.ext = true; st.resist += st.rise * 0.6; setText(m, "mmsg", "按一下肉球，指甲就伸出來了。"); } return; }
    // 剪
    for (const c of st.claws as Claw[]) {
      if (!c.ext || c.cut != null) continue;
      const y0 = c.y + 12, top = y0 - c.len, quick = y0 - c.len * 0.5;
      if (Math.abs(st.px - c.x) < 9 && st.py > top - 5 && st.py < y0 + 2) {
        st.resist += st.rise * 1.4;
        if (st.py > quick) { c.cut = "bleed"; st.bleed = true; st.resist += 35; setText(m, "mmsg", "剪到血線了！麻糬痛得縮了一下。"); }
        else if (st.py > top + c.len * 0.18) { c.cut = "good"; setText(m, "mmsg", "喀！剪得剛剛好。"); }
        else { c.cut = "tip"; setText(m, "mmsg", "只剪到一點點尖端。"); }
        return;
      }
    }
  };
  bindMiniButtons(m, () => {
    loopWith(m, dt => {
      st.t += dt;
      st.pulledT = (st.pulledT || 0) - dt;
      if (st.resist > 45 && st.t > st.nextPull) { st.pulledT = 1.0; st.nextPull = st.t + 2 + Math.random() * 2.5; st.claws.forEach((c: Claw) => { if (c.cut == null) c.ext = false; }); setText(m, "mmsg", "麻糬把腳抽回去了！等牠放鬆再來。"); }
      st.resist = Math.max(0, st.resist - (st.down ? 4 : 10) * dt);
      const off = st.pulledT > 0 ? 26 : 0;
      byId(m, "npaw")!.setAttribute("transform", `translate(0,${off})`);
      byId(m, "nclaws")!.innerHTML = st.claws.map((c: Claw) => {
        if (!c.ext && c.cut == null) return "";
        const L = c.cut === "good" ? c.len * 0.55 : c.cut === "tip" ? c.len * 0.85 : c.cut === "bleed" ? c.len * 0.4 : c.len;
        const y0 = c.y + 12;
        return `<path d="M${c.x - 4},${y0} Q${c.x - 3},${y0 - L} ${c.x + 1},${y0 - L - 2} Q${c.x + 4},${y0 - L * 0.6} ${c.x + 4},${y0} Z" fill="var(--tooth)" stroke="var(--cat-line)" stroke-width="1"/>
          <path d="M${c.x - 3.2},${y0} Q${c.x - 2.6},${y0 - c.len * 0.5} ${c.x + 1},${y0 - c.len * 0.5} Q${c.x + 3.4},${y0 - c.len * 0.3} ${c.x + 3.2},${y0} Z" fill="var(--paw)" opacity=".75"/>
          ${c.cut === "bleed" ? `<circle cx="${c.x}" cy="${y0 - L}" r="2.4" fill="var(--bad)"/>` : ""}`;
      }).join("");
      byId(m, "nclip")!.setAttribute("transform", `translate(${st.px.toFixed(1)},${st.py.toFixed(1)})`);
      const sc = score();
      setBar(m, "ncl", sc * 100); setText(m, "nc", `${st.claws.filter((c: Claw) => c.cut != null).length}/5`);
      setBar(m, "nrs", 100 - st.resist); setText(m, "nt", Math.max(0, Math.ceil(st.T - st.t)) + " 秒");
      const pawEl = byId(m, "npaw")!; pawEl.classList.toggle("shake", st.resist > 70);
      if (st.resist >= 100) { const bite = Math.random() < 0.5; setText(m, "mmsg", bite ? "麻糬受不了，回頭咬了你一口！" : "麻糬掙脫了，一溜煙跑走！"); setTimeout(() => finish(bite, !bite), 700); return false; }
      if (st.claws.every((c: Claw) => c.cut != null)) { setTimeout(() => finish(false, false), 500); return false; }
      if (st.t >= st.T) { finish(false, false); return false; }
    });
  }, () => finish(false, false));
}

function startBrush(m: Mini, S: MiniCtx) {
  const C = S.cat, lv = S.brushLevel ?? 0;
  const mode = BRUSH_MODES[Math.min(lv, 4)];
  const nTeeth = mode.key === "brush" ? 6 : 4;
  const st: St = {
    mode: mode.key, teeth: Array.from({ length: nTeeth }, () => clamp(0.4 - (S.dental ?? 50) / 90, 0, 0.4)),
    resist: 0, t: 0, T: 20, down: false, px: 262, py: 205, vx: 0, off: 0, turn: 0, turnUntil: 0, nextTurn: 2.2, last: 0,
    progress: 0, lift: 0, dragY: null, hold: 0, licks: 0, lickT: 0, lastPx: 262, lastPy: 205,
    rise: clamp(30 - lv * 2.5 - (C.trust - 50) * 0.1, 6, 32) * (mode.key === "finger" ? 0.85 : 1)
  };
  const open = st.mode === "finger" || st.mode === "brush";
  const x0 = st.mode === "brush" ? 121 : 133.5;
  const teeth = st.teeth.map((_: number, i: number) => { const x = x0 + i * 13.5; return `<rect x="${x}" y="141" width="11" height="17" rx="3" fill="var(--tooth)" stroke="var(--cat-line)" stroke-width="1.2"/><rect id="tar${i}" x="${x}" y="148" width="11" height="10" rx="2.5" fill="var(--tartar)"/>`; }).join("");
  const mouth = open
    ? `<ellipse cx="160" cy="160" rx="54" ry="31" fill="var(--mouth)" stroke="var(--cat-line)" stroke-width="3"/><ellipse cx="160" cy="178" rx="24" ry="9" fill="var(--paw)"/>${teeth}`
    : st.mode === "lift"
      ? `<rect x="128" y="140" width="64" height="22" rx="6" fill="var(--mouth)"/>${[0, 1, 2, 3].map(i => `<rect x="${134 + i * 13.5}" y="141" width="11" height="15" rx="3" fill="var(--tooth)" stroke="var(--cat-line)" stroke-width="1.2"/>`).join("")}
         <g id="blip"><path d="M122,138 Q160,132 198,138 L198,160 Q180,166 160,158 Q140,166 122,160 Z" fill="var(--fur)" stroke="var(--cat-line)" stroke-width="2.5"/></g>`
      : `<path d="M138,150 q11,9 22,0 q11,9 22,0" fill="none" stroke="var(--cat-line)" stroke-width="3" stroke-linecap="round"/><ellipse id="tongue" cx="160" cy="160" rx="0" ry="0" fill="var(--paw)"/>`;
  const target = st.mode === "touch" ? `<circle id="btarget" cx="132" cy="152" r="16" fill="var(--paw)" fill-opacity=".18" stroke="var(--paw)" stroke-dasharray="4 3" stroke-width="2"/>` : "";
  const tool = st.mode === "brush"
    ? `<rect x="-4" y="0" width="8" height="70" rx="4" fill="var(--accent)"/><rect x="-7" y="-14" width="14" height="16" rx="3" fill="var(--tooth)" stroke="var(--cat-line)" stroke-width="1"/><path d="M-5,-14 V-20 M-1,-14 V-21 M3,-14 V-21 M6,-14 V-19" stroke="var(--muted)" stroke-width="1.5"/>`
    : `<rect x="-8" y="0" width="16" height="64" rx="8" fill="var(--sand)" stroke="var(--cat-line)" stroke-width="1.5"/>
       ${st.mode === "finger" ? `<rect x="-9" y="-10" width="18" height="22" rx="8" fill="var(--glass)" stroke="var(--cat-line)" stroke-width="1"/><path d="M-6,-8 H6 M-6,-4 H6 M-6,0 H6" stroke="var(--muted)" stroke-width="1"/>` : ""}
       ${st.mode === "paste" ? `<ellipse id="pasteblob" cx="0" cy="-3" rx="7" ry="5" fill="var(--warn)"/>` : ""}`;
  const svg = `<svg id="bsvg" class="arena" viewBox="0 0 320 230">
    <g id="bhead"><g stroke="var(--cat-line)" stroke-width="3" stroke-linejoin="round">
      <g class="earL"><path d="M82,74 L92,6 L142,50 Z" fill="var(--fur)"/><path d="M94,62 L98,26 L124,50 Z" fill="var(--paw)" stroke="none"/></g>
      <g class="earR"><path d="M238,74 L228,6 L178,50 Z" fill="var(--fur)"/><path d="M226,62 L222,26 L196,50 Z" fill="var(--paw)" stroke="none"/></g>
      <circle cx="160" cy="118" r="92" fill="var(--fur)"/>
      <g id="beyes" stroke="none"><ellipse cx="122" cy="90" rx="8" ry="12" fill="var(--cat-line)"/><ellipse cx="198" cy="90" rx="8" ry="12" fill="var(--cat-line)"/></g>
      <path d="M151,116 L169,116 L160,126 Z" fill="var(--paw)" stroke="none"/>
      <path d="M110,124 L60,116 M110,132 L62,138 M210,124 L260,116 M210,132 L258,138" stroke-width="1.6" opacity=".5"/>
    </g>${mouth}${target}</g>
    <g id="bbrush" transform="translate(262,205) rotate(-28)">${tool}</g>
  </svg>`;
  m.root.innerHTML = miniFrame(`刷牙：${mode.title}`, `訓練階段 Lv.${lv}「${BRUSH_LEVELS[lv][0]}」・目標：${mode.goal}`, mode.hint, svg,
    miniMeter(open ? "乾淨度" : "進度", "bcl", "bc", "", "0%") + miniMeter("麻糬的忍耐", "brs", "bt", "low", "20 秒", 100));
  const el = m.root.querySelector<SVGSVGElement>("#bsvg")!;
  const pos = (e: PointerEvent) => { const p = svgPt(el, e); st.px = p.x; st.py = p.y; };
  el.addEventListener("pointerdown", (e: PointerEvent) => { if (!m.running) return; st.down = true; el.setPointerCapture(e.pointerId); pos(e); st.dragY = st.py; });
  el.addEventListener("pointermove", (e: PointerEvent) => { if (m.running) pos(e); });
  const up = () => { st.down = false; st.dragY = null; };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  const score = () => open ? st.teeth.reduce((a: number, b: number) => a + b, 0) / st.teeth.length : st.mode === "paste" ? st.licks / 3 : st.progress;
  const finish = (bitten: boolean) => end(m, { score: Math.round(score() * 100), bitten, mode: st.mode });
  bindMiniButtons(m, () => {
    setText(m, "mmsg", st.mode === "paste" ? "慢慢把手指移到麻糬的鼻子前面。" : "按住開始。");
    loopWith(m, dt => {
      st.t += dt;
      const spd = Math.hypot(st.px - st.lastPx, st.py - st.lastPy) / Math.max(dt, 1e-3); st.lastPx = st.px; st.lastPy = st.py;
      // 甩頭或轉頭
      if (st.t > st.nextTurn && st.resist > 18) { st.turnUntil = st.t + (open ? 0.5 : 0.9); st.turn = (Math.random() < 0.5 ? -1 : 1); st.nextTurn = st.t + 1.1 + Math.random() * 1.7; }
      const active = st.t < st.turnUntil;
      st.off = active ? (open ? Math.sin(st.t * 38) * 9 : st.turn * 22) : st.off * 0.85;
      // 貓頭會一直小幅晃動，要跟著移動
      const off = st.off + Math.sin(st.t * 1.7) * 6 + Math.sin(st.t * 0.6 + 1) * 5;
      let busy = false, msg = "";
      if (st.mode === "touch") {
        const tx = 132 + off, ty = 152;
        const on = st.down && Math.hypot(st.px - tx, st.py - ty) < 22;
        if (on) { busy = true; st.progress = Math.min(1, st.progress + dt / 6); msg = "輕輕的……"; }
        byId(m, "btarget")!.setAttribute("cx", tx.toFixed(1));
      } else if (st.mode === "lift") {
        const onLip = st.down && st.dragY != null && Math.abs(st.dragY - 150) < 20 && Math.abs(st.px - (160 + off)) < 50;
        st.lift = onLip ? clamp(st.dragY - st.py, 0, 20) : Math.max(0, st.lift - 60 * dt);
        if (st.lift >= 12) { busy = true; st.progress = Math.min(1, st.progress + dt / 4.5); msg = "看到牙齒了！"; }
        else if (st.down && onLip) msg = "再往上拉一點。";
        byId(m, "blip")!.setAttribute("transform", `translate(0,${(-st.lift).toFixed(1)})`);
      } else if (st.mode === "paste") {
        const nx = 160 + off, ny = 124, dist = Math.hypot(st.px - nx, st.py - ny);
        if (dist < 110 && spd > 240 && st.down) { st.resist += 26; st.turnUntil = st.t + 0.9; st.turn = st.px < nx ? 1 : -1; msg = "動作太快，嚇到牠了！"; }
        if (st.down && dist < 34 && spd < 70) {
          busy = true; st.hold += dt; msg = "麻糬湊過來聞了聞……";
          if (st.hold >= 1.5) { st.hold = 0; st.licks++; st.lickT = 0.5; msg = "舔了一口！"; }
        } else st.hold = Math.max(0, st.hold - dt);
        st.lickT -= dt;
        const tg = byId(m, "tongue")!; tg.setAttribute("rx", st.lickT > 0 ? 9 : 0); tg.setAttribute("ry", st.lickT > 0 ? 7 : 0);
        const pb = byId(m, "pasteblob")!; if (pb) pb.setAttribute("rx", Math.max(2, 7 - st.licks * 1.6));
      } else {
        const inMouth = st.down && Math.abs(st.px - (160 + off)) < 58 && Math.abs(st.py - 158) < 34;
        if (inMouth) {
          busy = true;
          st.teeth.forEach((v: number, i: number) => { const x = x0 + i * 13.5 + off; if (st.px > x - 6 && st.px < x + 17 && st.py > 132 && st.py < 170) st.teeth[i] = Math.min(1, v + 0.38 * dt); });
          msg = "刷刷刷……";
        } else if (st.down) msg = "要刷在嘴巴裡的牙齒上喔。";
        st.teeth.forEach((v: number, i: number) => byId(m, "tar" + i)!.setAttribute("opacity", (1 - v).toFixed(2)));
      }
      if (st.resist > 80 && st.down && Math.random() < dt * 0.9) { st.px += (Math.random() < 0.5 ? -1 : 1) * 60; st.down = false; st.swipeT = 0.6; }
      st.swipeT = (st.swipeT || 0) - dt;
      if (st.swipeT > 0) msg = "麻糬用爪子把你的手推開了！";
      if (busy) st.resist += st.rise * dt * (st.mode === "paste" ? 0.4 : 1);
      else st.resist = Math.max(0, st.resist - 16 * dt);
      const head = byId(m, "bhead")!;
      head.setAttribute("transform", open ? `translate(${off.toFixed(1)},0)` : `translate(${off.toFixed(1)},0) rotate(${(off * 0.4).toFixed(1)} 160 118)`);
      head.classList.toggle("flat", st.resist > 65);
      byId(m, "beyes")!.setAttribute("transform", st.resist > 65 ? "translate(0,90) scale(1,.45) translate(0,-90)" : "");
      byId(m, "bbrush")!.setAttribute("transform", `translate(${st.px.toFixed(1)},${st.py.toFixed(1)}) rotate(-28)`);
      const sc = score();
      setBar(m, "bcl", sc * 100); setText(m, "bc", Math.round(sc * 100) + "%");
      setBar(m, "brs", 100 - st.resist); setText(m, "bt", Math.max(0, Math.ceil(st.T - st.t)) + " 秒");
      setText(m, "mmsg", st.resist > 65 ? "麻糬耳朵往後壓了，先停一下！" : msg);
      if (st.resist >= 100) {
        const bite = Math.random() < 0.5;
        setText(m, "mmsg", bite ? "麻糬受不了了，回頭咬了你一口！" : "麻糬掙脫了，一溜煙跑走！");
        byId(m, "bhead")!.setAttribute("transform", bite ? "translate(0,-8)" : "translate(260,30) rotate(30 160 118)");
        setTimeout(() => end(m, { score: Math.round(score() * 100), bitten: bite, ran: !bite, mode: st.mode }), 800); return false;
      }
      if (sc >= 0.97) { finish(false); return false; }
      if (st.t >= st.T) { finish(false); return false; }
    });
  }, () => finish(false));
}

function startCarrier(m: Mini, S: MiniCtx) {
  const C = S.cat, A = { practice: false, name: "外出籠" };
  const k = 0.6 * catScale(S);
  const st: St = { px: 0, py: 0, down: false, cx: 60, dir: 1, tx: 60, R: clamp(170 - (S.carrierLevel ?? 0) * 30 - (C.trust - 50) * 0.6 + (C.stress > 60 ? 40 : 0), 20, 230),
    treat: null, fear: 0, t: 0, T: 30, last: 0, act: "sit", actT: 0, treats: 0, inside: false, say: "", sayT: 0, k };
  const DOOR = 262;
  const svg = `<svg id="csvg" class="arena" viewBox="0 0 360 220">
    <rect x="0" y="0" width="360" height="140" fill="var(--wall)"/><rect x="0" y="140" width="360" height="80" fill="var(--floor)"/><rect x="0" y="136" width="360" height="5" fill="var(--wood)"/>
    <g><path d="M284,120 C284,94 330,94 330,120" fill="none" stroke="var(--cat-line)" stroke-width="6" stroke-linecap="round"/>
      <rect x="262" y="118" width="92" height="82" rx="14" fill="var(--sofa)" stroke="var(--cat-line)" stroke-width="2.2"/>
      <path d="M262,156 H354" stroke="var(--cat-line)" stroke-width="1.5" opacity=".45"/>
      ${[0, 1, 2].map(i => `<rect x="${296 + i * 18}" y="132" width="10" height="16" rx="5" fill="var(--cat-line)" opacity=".35"/>`).join("")}
      <rect x="262" y="128" width="9" height="64" fill="var(--mouth)"/>
      <g id="cdoor"><path d="M262,128 L232,138 L232,186 L262,192 Z" fill="#dfe5e8" stroke="var(--cat-line)" stroke-width="1.8"/>
        ${[0, 1, 2, 3].map(i => `<path d="M${238 + i * 6},${136 - i * 2} V${187 + i * 1.3}" stroke="var(--muted)" stroke-width="1.6"/>`).join("")}<path d="M232,162 L262,160" stroke="var(--muted)" stroke-width="1.4"/></g></g>
    <g id="ctreat"></g>
    <g id="ccat" transform="translate(60,200)"><g id="ccatin" class="${catMood(S)}" transform="scale(${k},${k})">${catParts(S)}</g></g>
    <circle id="cring" cx="${DOOR}" cy="200" r="${st.R}" fill="none" stroke="var(--bad)" stroke-dasharray="3 5" opacity=".35"/>
    <text id="csay" x="60" y="130" font-size="13" fill="var(--paw)" text-anchor="middle" font-weight="700"></text>
  </svg>`;
  m.root.innerHTML = miniFrame(A.practice ? "外出籠練習" : `出門前：${A.name}`, A.practice ? "單次行動" : "要先讓麻糬進外出籠",
    "點地板放一顆零食。放在麻糬覺得安全的距離，牠吃了之後會比較不怕外出籠，再一顆一顆往籠子裡放。放得太靠近，牠會不敢過去。紅色虛線是麻糬覺得危險的範圍。",
    svg, miniMeter("緊張", "cfl", "cf", "low", "0") + miniMeter("時間", "ctl", "ct", "", "30 秒", 100),
    "");
  const el = m.root.querySelector<SVGSVGElement>("#csvg")!;
  const say = (t: string) => { st.say = t; st.sayT = 1.3; };
  el.addEventListener("pointerdown", (e: PointerEvent) => {
    if (!m.running || st.inside) return;
    const p = svgPt(el, e); if (p.y < 140) return;
    st.treat = { x: clamp(p.x, 20, 340) };
    st.act = "sit"; st.actT = 0;
  });
  const done = (ok: boolean, forced: boolean) => end(m, { ok, forced, treats: st.treats, practice: !!A.practice });
  bindMiniButtons(m, () => {
    setText(m, "mmsg", "先在離籠子遠一點的地方放零食。");
    loopWith(m, dt => {
      st.t += dt; st.sayT -= dt;
      const sp = 70;
      if (st.treat && !st.inside) {
        const dT = st.treat.x >= DOOR + 6 ? 0 : DOOR - st.treat.x;
        const stopX = Math.min(st.treat.x, DOOR - st.R);
        const allowed = dT >= st.R - 8 || st.R <= 10;
        const goal = allowed ? st.treat.x - 18 : stopX - 18;
        const dx = goal - st.cx;
        if (Math.abs(dx) > 2) { st.dir = dx > 0 ? 1 : -1; st.cx += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt); }
        else if (allowed) {
          st.actT += dt;
          if (st.actT > 0.7) {
            st.treats++; st.R = Math.max(0, st.R - 32); st.fear = Math.max(0, st.fear - 8);
            if (st.treat.x >= DOOR + 6) { st.inside = true; say("（走進去了）"); }
            else say("（喀滋喀滋）");
            st.treat = null; st.actT = 0;
          }
        } else {
          st.actT += dt;
          if (st.actT > 0.9) { st.fear += 14; say("不要……"); st.cx -= 30; st.actT = 0; }
        }
      } else if (st.inside) {
        const dx = DOOR + 40 - st.cx; if (Math.abs(dx) > 2) st.cx += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
        else { byId(m, "cdoor")!.innerHTML = `<rect x="256" y="128" width="12" height="64" rx="2" fill="#dfe5e8" stroke="var(--cat-line)" stroke-width="1.8"/>${[0, 1, 2, 3, 4, 5, 6].map(i => `<path d="M256,${136 + i * 8} H268" stroke="var(--muted)" stroke-width="1.5"/>`).join("")}`; done(true, false); return false; }
      }
      byId(m, "ccat")!.setAttribute("transform", `translate(${st.cx.toFixed(1)},200)`);
      byId(m, "ccatin")!.setAttribute("transform", `scale(${(st.dir * st.k).toFixed(3)},${st.k.toFixed(3)})`);
      byId(m, "ccatin")!.setAttribute("class", st.fear > 50 ? "flat wide" : st.treats >= 2 ? "purr" : "");
      byId(m, "ctreat")!.innerHTML = st.treat ? `<g transform="translate(${st.treat.x},196)"><ellipse rx="6" ry="4" fill="var(--warn)" stroke="var(--cat-line)" stroke-width="1"/></g>` : "";
      byId(m, "cring")!.setAttribute("r", st.R.toFixed(1));
      const cs = byId(m, "csay")!; cs.setAttribute("x", st.cx.toFixed(1)); cs.setAttribute("y", (200 - 140 * st.k - 8).toFixed(1)); cs.textContent = st.sayT > 0 ? st.say : "";
      setBar(m, "cfl", st.fear); setText(m, "cf", String(Math.round(st.fear)));
      setBar(m, "ctl", (1 - st.t / st.T) * 100); setText(m, "ct", Math.max(0, Math.ceil(st.T - st.t)) + " 秒");
      if (st.fear >= 100) { setText(m, "mmsg", "麻糬躲到沙發下了……"); done(false, true); return false; }
      if (st.t >= st.T) { done(false, true); return false; }
    });
  }, () => done(false, true), A.practice ? "今天先練到這裡" : "直接抓進去");
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- 摸貓：按住貓咪慢慢滑動。頭頂、下巴、背是喜歡的地方（其中一個最愛），肚子和尾巴會讓牠不高興 ----------
function startPet(m: Mini, S: MiniCtx) {
  const k = 1.25 * catScale(S);
  const favs = ["head", "chin", "back"] as const;
  const fav = favs[Math.floor(Math.random() * favs.length)];
  const st = { px: 0, py: 0, down: false, lastX: -1, lastY: -1, fun: 0, annoy: 0, t: 0, T: 20, hearts: [] as { x: number; y: number; age: number }[], zone: "" as string, ran: false };
  const CX = 180, CY = 206;
  const svg = `<svg id="psvg" class="arena" viewBox="0 0 360 220">
    <rect x="0" y="0" width="360" height="150" fill="var(--wall)"/><rect x="0" y="150" width="360" height="70" fill="var(--floor)"/><rect x="0" y="146" width="360" height="5" fill="var(--wood)"/>
    <g id="pcat" transform="translate(${CX},${CY})"><g id="pcatin" class="${catMood(S)}" transform="scale(${k.toFixed(3)},${k.toFixed(3)})">${catParts(S)}</g></g>
    <g id="phearts"></g>
  </svg>`;
  m.root.innerHTML = miniFrame("摸貓", "照顧・陪伴",
    "按住麻糬，手指慢慢在牠身上滑動。頭頂、下巴和背摸起來會冒出愛心，其中有一個地方是牠的最愛；肚子和尾巴不要碰，耳朵往後壓就先放開。",
    svg, miniMeter("開心度", "pfl", "pf", "paw", "0") + miniMeter("煩躁", "pal", "pa", "low", "0") + miniMeter("時間", "ptl", "pt", "", "20 秒", 100), "");
  const el = m.root.querySelector<SVGSVGElement>("#psvg")!;
  trackPointer(el, st);
  const zoneAt = (x: number, y: number) => {
    const lx = (x - CX) / k, ly = (y - CY) / k;
    if (Math.hypot(lx, ly + 92) < 32) return ly > -78 && ly < -64 && Math.abs(lx) < 16 ? "chin" : "head";
    if (lx > 40 && lx < 90 && ly < -8 && ly > -100) return "tail";
    if (Math.abs(lx) < 44 && ly > -50 && ly < 0) return "belly";
    if (Math.abs(lx) < 44 && ly <= -50 && ly > -82) return "back";
    return "";
  };
  const done = () => end(m, { fun: Math.round(st.fun), annoyed: Math.round(st.annoy), ran: st.ran });
  bindMiniButtons(m, () => {
    setText(m, "mmsg", "按住麻糬，慢慢摸。");
    loopWith(m, dt => {
      st.t += dt;
      const moved = st.down && st.lastX >= 0 ? Math.hypot(st.px - st.lastX, st.py - st.lastY) : 0;
      st.lastX = st.down ? st.px : -1; st.lastY = st.py;
      let msg = "";
      const z = st.down ? zoneAt(st.px, st.py) : "";
      st.zone = z;
      if (st.down && (z === "head" || z === "chin" || z === "back")) {
        const speed = moved / Math.max(dt, 0.001);
        if (speed > 420) { st.annoy += 40 * dt; msg = "摸太快了，慢一點。"; }
        else {
          const gain = moved * 0.05 * (z === fav ? 2 : 1);
          st.fun = Math.min(100, st.fun + gain); st.annoy = Math.max(0, st.annoy - 6 * dt);
          if (gain > 0.3 && Math.random() < gain * 0.5) st.hearts.push({ x: st.px + (Math.random() - 0.5) * 20, y: st.py - 10, age: 0 });
          msg = z === fav ? "就是這裡！麻糬舒服得瞇起眼睛。" : "輕輕的……麻糬發出呼嚕聲。";
        }
      } else if (st.down && (z === "belly" || z === "tail")) {
        st.annoy += 45 * dt + moved * 0.12; st.fun = Math.max(0, st.fun - moved * 0.03);
        msg = z === "belly" ? "摸到肚子了，麻糬不太高興！" : "不要碰尾巴！";
      } else st.annoy = Math.max(0, st.annoy - 8 * dt);
      st.hearts.forEach(h => { h.age += dt; h.y -= 28 * dt; });
      st.hearts = st.hearts.filter(h => h.age < 1.1);
      byId(m, "phearts")!.innerHTML = st.hearts.map(h => `<text x="${h.x.toFixed(1)}" y="${h.y.toFixed(1)}" font-size="16" text-anchor="middle" fill="var(--bad)" opacity="${(1 - h.age / 1.1).toFixed(2)}">♥</text>`).join("");
      byId(m, "pcatin")!.setAttribute("class", st.annoy > 55 ? "flat wide" : st.fun > 45 ? "purr" : "");
      setBar(m, "pfl", st.fun); setText(m, "pf", String(Math.round(st.fun)));
      setBar(m, "pal", st.annoy); setText(m, "pa", String(Math.round(st.annoy)));
      setBar(m, "ptl", (1 - st.t / st.T) * 100); setText(m, "pt", Math.max(0, Math.ceil(st.T - st.t)) + " 秒");
      setText(m, "mmsg", st.annoy > 65 ? "麻糬耳朵往後壓了，先放開！" : msg || (st.down ? "" : "按住麻糬，慢慢摸。"));
      if (st.annoy >= 100) { st.ran = true; setText(m, "mmsg", "麻糬生氣了，一溜煙跑走！"); setTimeout(done, 700); return false; }
      if (st.fun >= 100 || st.t >= st.T) { done(); return false; }
    });
  }, done);
}

const STARTERS: Record<MiniId, (m: Mini, S: MiniCtx) => void> = {
  scoop: startScoop, pet: startPet, feed: startFeed, water: startWater, nail: startNail, brush: startBrush, carrier: startCarrier,
};

/** 在 root 裡開一個小遊戲；回傳停止函式（元件卸載時呼叫，不會回傳結果） */
export function startMini(id: MiniId, root: HTMLElement, ctx: MiniCtx, onDone: (r: unknown) => void): () => void {
  const m: Mini = { root, raf: 0, running: !["pet", "nail", "brush", "carrier"].includes(id), closed: false, done: onDone, last: 0 };
  STARTERS[id](m, ctx);
  return () => { if (!m.closed) { m.closed = true; cancelAnimationFrame(m.raf); root.innerHTML = ""; } };
}
