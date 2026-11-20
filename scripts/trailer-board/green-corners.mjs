// 量 AI 片段裡綠幕螢幕的四個角（前導影片第三段，SOP 見 docs/video/前導影片第三段_片段製作SOP.md）
// 用法：node scripts/trailer-board/green-corners.mjs <AI影片.mp4> [開始秒=1] [秒數=2]
// 每 0.25 秒取一格，印出每格的四角與綠色像素數，最後給「建議四角」：取各格最外側再外擴 3px，給 green-composite.sh 用。
// 判斷：綠色像素數各格差不到 15%、四角最多飄 6px，才算螢幕有穩住；不然這支片段不能用，要重生（見 SOP「驗收」）。
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const [video, start = "1", dur = "2"] = process.argv.slice(2);
if (!video) { console.error("用法：node scripts/trailer-board/green-corners.mjs <AI影片.mp4> [開始秒] [秒數]"); process.exit(1); }
const dir = mkdtempSync(join(tmpdir(), "green-"));
execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", start, "-t", dur, "-i", video, "-vf", "fps=4", join(dir, "%03d.png")]);

const rows = [];
for (const f of readdirSync(dir).sort()) {
  const { data, info } = await sharp(join(dir, f)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let n = 0, tl = [0, 0], tr = [0, 0], br = [0, 0], bl = [0, 0];
  const b = [Infinity, -Infinity, -Infinity, -Infinity];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, r = data[i], g = data[i + 1], bb = data[i + 2];
    if (!(g > 120 && g > r * 1.5 && g > bb * 1.5)) continue;
    n++;
    if (x + y < b[0]) { b[0] = x + y; tl = [x, y]; }
    if (x - y > b[1]) { b[1] = x - y; tr = [x, y]; }
    if (x + y > b[2]) { b[2] = x + y; br = [x, y]; }
    if (y - x > b[3]) { b[3] = y - x; bl = [x, y]; }
  }
  rows.push({ f, n, tl, tr, br, bl, W, H });
  console.log(f, n, JSON.stringify({ tl, tr, br, bl }));
}
if (!rows.length || rows.some(r => r.n < 2000)) { console.log("有幾格找不到綠幕（綠色像素 < 2000），這支不能用"); process.exit(2); }

const ns = rows.map(r => r.n), spread = (Math.max(...ns) - Math.min(...ns)) / Math.max(...ns);
const pick = (k, fx, fy) => [fx(...rows.map(r => r[k][0])), fy(...rows.map(r => r[k][1]))];
const tl = pick("tl", Math.min, Math.min), tr = pick("tr", Math.max, Math.min), bl = pick("bl", Math.min, Math.max), br = pick("br", Math.max, Math.max);
const drift = Math.max(...["tl", "tr", "br", "bl"].flatMap(k => [0, 1].map(a => Math.max(...rows.map(r => r[k][a])) - Math.min(...rows.map(r => r[k][a])))));
const e = 3, q = [tl[0] - e, tl[1] - e, tr[0] + e, tr[1] - e, bl[0] - e, bl[1] + e, br[0] + e, br[1] + e];
console.log(`\n影片 ${rows[0].W}x${rows[0].H}；綠色像素差異 ${(spread * 100).toFixed(1)}%；四角最大飄移 ${drift}px`);
console.log(spread <= 0.15 && drift <= 6 ? "螢幕穩定，可以合成" : "螢幕不穩（被手擋太多或晃動），先看畫面再決定要不要重生");
console.log(`建議四角（左上 右上 左下 右下）：${q.join(":")}`);
