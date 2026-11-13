// 虛擬飼養採買畫面（#354）：把遊戲裡的 3D 道具截成透明底 256px WebP，放到 public/play/thumbs/。
// 用法：node scripts/render-play-thumbs.mjs   （需要 google-chrome；CHROME=<路徑> 可換瀏覽器）
// 做法：esbuild 把 scripts/play-thumbs/entry.tsx 打包 → 本機開一個小伺服器 → headless Chrome 開頁面，每畫好一張就 POST 回來 → sharp 縮成 256px WebP。
// 截哪些東西寫在 entry.tsx 的 SHOTS。不新增套件：esbuild、sharp 都是專案原本就有的（vite／next 帶進來的）。
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public/play/thumbs");
const SIZE = 256;

const bundle = await build({
  entryPoints: [path.join(root, "scripts/play-thumbs/entry.tsx")], bundle: true, write: false, format: "iife", platform: "browser",
  jsx: "automatic", alias: { "@": path.join(root, "src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning",
});
const js = bundle.outputFiles[0].text;
await mkdir(out, { recursive: true });

const saved = [];
let finish;
const finished = new Promise(r => { finish = r; });
const body = req => new Promise(r => { const c = []; req.on("data", d => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "POST" && url.pathname === "/shot") {
      const name = url.searchParams.get("name").replace(/[^a-z0-9_]/g, "");
      const png = Buffer.from((await body(req)).toString().split(",")[1], "base64");
      await sharp(png).resize(SIZE, SIZE).webp({ quality: 88, alphaQuality: 90 }).toFile(path.join(out, `${name}.webp`));
      saved.push(name); console.log(`  ${name}.webp`);
      return res.end("ok");
    }
    if (req.method === "POST" && url.pathname === "/done") { res.end("ok"); return finish(); }
    if (url.pathname === "/") return res.setHeader("content-type", "text/html").end('<!doctype html><body style="margin:0"><div id="root"></div><script src="/entry.js"></script>');
    if (url.pathname === "/entry.js") return res.setHeader("content-type", "text/javascript").end(js);
    if (url.pathname.startsWith("/play/")) return res.end(await readFile(path.join(root, "public", path.normalize(url.pathname))));
    res.statusCode = 404; res.end();
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const profile = await mkdtemp(path.join(tmpdir(), "play-thumbs-"));
const chrome = spawn(process.env.CHROME || "google-chrome", [
  "--headless=new", "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  `--user-data-dir=${profile}`, "--window-size=600,600", `http://127.0.0.1:${port}/`,
], { stdio: "ignore" });

const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("逾時：Chrome 沒有在 120 秒內畫完")), 120000));
try { await Promise.race([finished, timeout]); console.log(`完成：${saved.length} 張 → public/play/thumbs/`); }
catch (e) { console.error(String(e.message || e), `（已完成 ${saved.join("、") || "0 張"}）`); process.exitCode = 1; }
finally {
  chrome.kill(); server.close(); server.closeAllConnections();
  await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  process.exit(process.exitCode ?? 0);  // Chrome 的子行程偶爾會拖住，畫完就直接結束
}
