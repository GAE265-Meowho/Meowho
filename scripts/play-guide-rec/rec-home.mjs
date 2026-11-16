// 首頁「7 天虛擬飼養」區塊的示範影片：node rec-home.mjs <feed|scoop|pet>（先 npm run dev；步驟見 docs/play-tasks/guide-videos.md「首頁版」）
// 和 rec.mjs 同樣開真正的小遊戲、照 play-<小遊戲>.mjs 操作，差別：只截 3D 畫布（不含標題、說明、計量條）、2 倍解析度、隱藏摸貓的視角按鈕。
// 輸出 $OUT/<小遊戲>.raw.mp4，再用 encode-home.sh 裁切轉檔到 public/home/trial/。
// BASE＝dev server 網址（預設 http://localhost:3000）；CHROME＝Chrome／Chromium 執行檔路徑。
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";
const OUT = process.env.OUT ?? "/tmp/play-guide-rec";
mkdirSync(OUT, { recursive: true });
const game = process.argv[2];
const b = await puppeteer.launch({ executablePath: process.env.CHROME, args: ["--no-sandbox", "--ignore-gpu-blocklist"], defaultViewport: { width: 900, height: 760, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { let a = 12345; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });
p.on("pageerror", e => console.log("pageerror", e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
await p.goto(`${process.env.BASE ?? "http://localhost:3000"}/dev/play-guide-rec?g=${game}`, { waitUntil: "networkidle2", timeout: 180000 });
await wait(3000);
// 游標放到 top layer（彈窗之上）：白色滑鼠箭頭（黑邊、陰影），按下時箭頭尖端出現橘色波紋（2026-11-14 渝茜：不要用圓圈）
await p.evaluate(() => {
  const c = document.createElement("div");
  c.setAttribute("popover", "manual");
  c.style.cssText = "position:fixed;inset:auto;margin:0;padding:0;border:0;background:none;left:-80px;top:-80px;width:44px;height:52px;pointer-events:none;overflow:visible";
  c.innerHTML = `<span style="position:absolute;left:-20px;top:-20px;width:40px;height:40px;border-radius:50%;background:rgba(232,120,40,.55);transform:scale(0);transition:transform .12s,opacity .12s;opacity:0"></span>
    <svg width="34" height="46" viewBox="0 0 17 23" style="position:absolute;left:-2px;top:-1px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.45));transition:transform .1s;transform-origin:2px 1px">
      <path d="M1 1v17.5l4.4-4.2 2.9 6.8 3-1.3-2.9-6.6H15z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  document.body.appendChild(c); c.showPopover();
  const ring = c.firstElementChild, arrow = c.querySelector("svg");
  addEventListener("pointermove", e => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
  addEventListener("pointerdown", () => { ring.style.transform = "scale(1)"; ring.style.opacity = "1"; arrow.style.transform = "scale(.9)"; }, true);
  addEventListener("pointerup", () => { ring.style.transform = "scale(0)"; ring.style.opacity = "0"; arrow.style.transform = "none"; }, true);
});
const box = async sel => { const h = await p.$(sel); return h ? h.boundingBox() : null; };
const btn = async text => {
  const h = await p.evaluateHandle(t => [...document.querySelectorAll("dialog[open] button, button")].find(e => e.textContent.trim().includes(t)) ?? null, text);
  const el = h.asElement(); return el ? el.boundingBox() : null;
};
const M = p.mouse;
const glide = async (x, y, steps = 12) => { await M.move(x, y, { steps }); };
const center = b => [b.x + b.width / 2, b.y + b.height / 2];
await p.addStyleTag({ content: '[role=group][aria-label="轉動視角"]{visibility:hidden!important}' });
// 首頁版：只錄 3D 畫布（彈窗裡的 canvas），不含標題與說明文字
const crop = await p.evaluate(() => { const c = document.querySelector("dialog[open] canvas"); const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.floor(r.width / 2) * 2, height: Math.floor(r.height / 2) * 2 }; });
console.log("crop", JSON.stringify(crop), await p.evaluate(() => devicePixelRatio));
// 自己收 CDP 畫格（puppeteer 的 screencast 只給 CSS 像素大小），存成 2 倍解析度 png＋時間戳，最後用 ffmpeg concat 接起來
import { writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
const FR = `${OUT}/frames_${game}`; rmSync(FR, { recursive: true, force: true }); mkdirSync(FR, { recursive: true });
// 截圖迴圈：DPR 2 的截圖才是真的 2 倍像素（CDP screencast 只給 CSS 像素）
const frames = [];
let recording = true;
const cdp = await p.createCDPSession();
const loop = (async () => {
  while (recording) {
    // 畫布位置會因上方文字出現而移動：每格重抓，四周內縮 14px 避開圓角
    const r = await p.evaluate(() => { const c = document.querySelector("dialog[open] canvas"); if (!c) return null; const b = c.getBoundingClientRect(); return { x: b.x, y: b.y }; });
    if (!r) { await wait(30); continue; }
    const I = 14;
    const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, clip: { x: r.x + I, y: r.y + I, width: crop.width - 2 * I, height: crop.height - 2 * I, scale: 2 }, optimizeForSpeed: true });
    const name = `${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(`${FR}/${name}`, Buffer.from(data, "base64"));
    frames.push({ name, t: performance.now() / 1000 });
  }
})();
const rec = { stop: async () => {
  recording = false; await loop;
  frames.push({ ...frames.at(-1), t: frames.at(-1).t + 0.5 });
  const list = frames.slice(0, -1).map((f, i) => `file '${f.name}'\nduration ${(frames[i + 1].t - f.t).toFixed(4)}`).join("\n") + `\nfile '${frames.at(-1).name}'\n`;
  writeFileSync(`${FR}/list.txt`, list);
  const c = { x: crop.x * 2, y: crop.y * 2, w: crop.width * 2, h: crop.height * 2 };
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${FR}/list.txt`, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", `${OUT}/${game}.raw.mp4`]);
} };
const { default: run } = await import(`./play-${game}.mjs`);  // 每個小遊戲的操作路線
try { await run({ p, M, wait, glide, btn, box, center }); } catch (e) { console.log("ERR", e.message); }
await wait(800);
await rec.stop();
await p.screenshot({ path: `${OUT}/${game}-end.png` });
console.log("box", JSON.stringify(crop));
console.log("done", await p.evaluate(() => JSON.stringify(window.__done ?? null)));
await b.close();
