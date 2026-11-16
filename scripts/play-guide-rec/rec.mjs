// 錄一段小遊戲示範：node rec.mjs <feed|water|scoop|pet|brush|nail>（先 npm run dev；步驟見 docs/play-tasks/guide-videos.md）
// 開真正的小遊戲（/dev/play-guide-rec），照 play-<小遊戲>.mjs 的路線用滑鼠操作，邊做邊錄成 $OUT/<小遊戲>.webm。亂數固定，砂團等位置每次一樣。
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";
const OUT = process.env.OUT ?? "/tmp/play-guide-rec";
mkdirSync(OUT, { recursive: true });
const game = process.argv[2];
const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"], defaultViewport: { width: 900, height: 760 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => { let a = 12345; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });
p.on("pageerror", e => console.log("pageerror", e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
await p.goto(`http://localhost:3000/dev/play-guide-rec?g=${game}`, { waitUntil: "networkidle2", timeout: 180000 });
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
const crop = await p.evaluate(() => { const d = document.querySelector("dialog[open]") ?? document.querySelector("[class*=modal]"); const r = d.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); });
const rec = await p.screencast({ path: `${OUT}/${game}.webm` });
const { default: run } = await import(`./play-${game}.mjs`);  // 每個小遊戲的操作路線
try { await run({ p, M, wait, glide, btn, box, center }); } catch (e) { console.log("ERR", e.message); }
await wait(800);
await rec.stop();
await p.screenshot({ path: `${OUT}/${game}-end.png` });
console.log("box", JSON.stringify(crop));
console.log("done", await p.evaluate(() => JSON.stringify(window.__done ?? null)));
await b.close();
