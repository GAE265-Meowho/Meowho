// 首頁「領養任務」區塊的示範影片：node rec-home.mjs <feed|scoop|pet>（先 npm run dev；步驟見 docs/play-tasks/guide-videos.md「首頁版」）
// 和 rec.mjs 同樣開真正的小遊戲、照 play-<小遊戲>.mjs 操作，差別：
//   - 把彈窗與 3D 畫布放大到約 1850px 寬（長寬比照原本 494:356，鏡頭構圖不變），遊戲直接用這個解析度畫
//   - 用 canvas.captureStream 錄 3D 畫布本身（不含標題、說明、計量條、摸貓的視角按鈕），不是截圖再放大；滑鼠箭頭另外畫進去
//   - play-*.mjs 寫死的座標是原本 900×760 版面的畫布座標，這裡換算到放大後的畫布
// 輸出 $OUT/<小遊戲>.webm，再用 encode-home.sh 裁切轉檔到 public/home/trial/。
// BASE＝dev server 網址（預設 http://localhost:3000）；CHROME＝Chrome／Chromium 執行檔路徑。
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
const OUT = process.env.OUT ?? "/tmp/play-guide-rec";
mkdirSync(OUT, { recursive: true });
const game = process.argv[2];
// 原本 900×760 版面裡畫布的位置（play-*.mjs 的座標以此為準）
const OLD = { feed: { x: 203, y: 219 }, scoop: { x: 203, y: 201 }, pet: { x: 203, y: 130 } }[game];
const OLD_W = 494, OLD_H = 356, DIALOG_W = 1900;
const b = await puppeteer.launch({ executablePath: process.env.CHROME, args: ["--no-sandbox", "--ignore-gpu-blocklist"], defaultViewport: { width: 2000, height: 1700, deviceScaleFactor: 1 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { let a = 12345; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });
p.on("pageerror", e => console.log("pageerror", e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
await p.goto(`${process.env.BASE ?? "http://localhost:3000"}/dev/play-guide-rec?g=${game}`, { waitUntil: "networkidle2", timeout: 180000 });
await wait(3000);
// 放大彈窗與畫布：畫布高度照原本比例
await p.addStyleTag({ content: `dialog[open]{width:${DIALOG_W}px!important;max-height:none!important}[role=group][aria-label="轉動視角"]{visibility:hidden!important}` });
await p.evaluate((ow, oh) => {
  const c = document.querySelector("dialog[open] canvas");
  let sc = c; while (sc && !/scene/.test(sc.className)) sc = sc.parentElement;
  sc.style.setProperty("height", `${Math.round(sc.clientWidth * oh / ow)}px`, "important");
}, OLD_W, OLD_H);
await wait(2500);
const rect = () => p.evaluate(() => { const r = document.querySelector("dialog[open] canvas").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
const R = await rect();
console.log("canvas", JSON.stringify(R), await p.evaluate(() => { const c = document.querySelector("dialog[open] canvas"); return [c.width, c.height]; }));

// 寫死的座標（落在原本畫布範圍內的）換算到放大後的畫布；按鈕座標由 btn() 直接量，不換算
const map = (x, y) => {
  const inOld = x >= OLD.x - 20 && x <= OLD.x + OLD_W + 20 && y >= OLD.y - 20 && y <= OLD.y + OLD_H + 20;
  return inOld ? [R.x + (x - OLD.x) * R.width / OLD_W, R.y + (y - OLD.y) * R.height / OLD_H] : [x, y];
};
const k = R.width / OLD_W;
const M = {
  move: (x, y, o) => p.mouse.move(...map(x, y), o?.steps ? { steps: Math.round(o.steps * Math.min(k, 2)) } : o),
  down: () => p.mouse.down(), up: () => p.mouse.up(),
};
const box = async sel => { const h = await p.$(sel); return h ? h.boundingBox() : null; };
const btn = async text => {
  const h = await p.evaluateHandle(t => [...document.querySelectorAll("dialog[open] button, button")].find(e => e.textContent.trim().includes(t)) ?? null, text);
  const el = h.asElement(); return el ? el.boundingBox() : null;
};
// 按鈕在畫布外，座標不換算：直接用真正的滑鼠
const glide = async (x, y, steps = 12) => { await M.move(x, y, { steps }); };
const center = bb => [bb.x + bb.width / 2, bb.y + bb.height / 2];

// 開始錄：每格把 3D 畫布疊到場景底色上（畫布透明處直接錄會變黑），再畫白色滑鼠箭頭（按下時尖端有橘色波紋，同 rec.mjs），錄這張合成畫布
await p.evaluate(() => {
  const gl = document.querySelector("dialog[open] canvas");
  let sc = gl; while (sc && !/scene/.test(sc.className)) sc = sc.parentElement;
  const bg = getComputedStyle(sc).backgroundColor;
  const c = document.createElement("canvas"); c.width = gl.width; c.height = gl.height;
  const g = c.getContext("2d");
  const ptr = { x: -999, y: -999, down: false };
  addEventListener("pointermove", e => { const r = gl.getBoundingClientRect(); ptr.x = (e.clientX - r.x) * gl.width / r.width; ptr.y = (e.clientY - r.y) * gl.height / r.height; }, true);
  addEventListener("pointerdown", () => { ptr.down = true; }, true);
  addEventListener("pointerup", () => { ptr.down = false; }, true);
  const arrow = new Path2D("M1 1v17.5l4.4-4.2 2.9 6.8 3-1.3-2.9-6.6H15z");
  const S = 4.2;  // 箭頭大小：首頁顯示時約 30px
  const draw = () => {
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(gl, 0, 0);
    if (ptr.x > -50 && ptr.x < c.width + 50 && ptr.y > -50 && ptr.y < c.height + 50) {
      if (ptr.down) { g.fillStyle = "rgba(232,120,40,.55)"; g.beginPath(); g.arc(ptr.x, ptr.y, 20 * S / 2, 0, Math.PI * 2); g.fill(); }
      g.save(); g.translate(ptr.x - 1 * S, ptr.y - 1 * S); g.scale(S * (ptr.down ? 0.9 : 1), S * (ptr.down ? 0.9 : 1));
      g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 2; g.shadowOffsetY = 2 / S * 2;
      g.fillStyle = "#fff"; g.fill(arrow); g.shadowColor = "transparent";
      g.lineWidth = 1.4; g.lineJoin = "round"; g.strokeStyle = "#111"; g.stroke(arrow); g.restore();
    }
    requestAnimationFrame(draw);
  };
  draw();
  const r = new MediaRecorder(c.captureStream(60), { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 16e6 });
  window.__chunks = []; r.ondataavailable = e => window.__chunks.push(e.data); r.start(250); window.__rec = r;
});
const { default: run } = await import(`./play-${game}.mjs`);  // 每個小遊戲的操作路線
try { await run({ p, M, wait, glide, btn, box, center }); } catch (e) { console.log("ERR", e.message); }
await wait(800);
const b64 = await p.evaluate(async () => {
  await new Promise(res => { window.__rec.onstop = res; window.__rec.stop(); });
  const buf = new Uint8Array(await new Blob(window.__chunks, { type: "video/webm" }).arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
});
writeFileSync(`${OUT}/${game}.webm`, Buffer.from(b64, "base64"));
console.log("done", await p.evaluate(() => JSON.stringify(window.__done ?? null)));
await b.close();
