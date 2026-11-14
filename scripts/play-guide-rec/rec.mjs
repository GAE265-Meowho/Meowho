// 錄一段小遊戲示範：node rec.mjs <feed|water|scoop|pet|brush|nail|carrier>（先 npm run dev；步驟見 docs/play-tasks/guide-videos.md）
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
// 游標放到 top layer（彈窗之上）
await p.evaluate(() => {
  const c = document.createElement("div");
  c.setAttribute("popover", "manual");
  c.id = "fakecur";
  c.style.cssText = "position:fixed;inset:auto;margin:0;padding:0;left:-60px;top:-60px;width:34px;height:34px;transform:translate(-17px,-17px);border-radius:50%;border:3px solid #fff;background:rgba(232,120,40,.5);box-shadow:0 0 0 2px rgba(0,0,0,.35);pointer-events:none;overflow:visible";
  document.body.appendChild(c); c.showPopover();
  addEventListener("pointermove", e => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
  addEventListener("pointerdown", () => { c.style.background = "rgba(232,120,40,.9)"; c.style.transform = "translate(-17px,-17px) scale(.8)"; }, true);
  addEventListener("pointerup", () => { c.style.background = "rgba(232,120,40,.5)"; c.style.transform = "translate(-17px,-17px)"; }, true);
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
