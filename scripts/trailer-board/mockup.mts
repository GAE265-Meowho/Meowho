// 把真實 UI 截圖貼進分鏡底圖的綠幕螢幕（#529 後續）：npx tsx scripts/trailer-board/mockup.mts <底圖.png> <UI.png> <輸出.png>
// 找出純綠色像素的四個角，用 ffmpeg perspective 把 UI 扭成螢幕的形狀，只替換綠色像素（手指、反光以外的遮擋都保留）。
// UI 一律用系統錄影或截圖，不用 AI 生成。
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const [basePath, uiPath, outPath] = process.argv.slice(2);
const base = sharp(basePath).removeAlpha();
const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const isGreen = (i: number) => { const r = data[i], g = data[i + 1], b = data[i + 2]; return g > 150 && g > r * 1.6 && g > b * 1.6; };
const mask = new Uint8Array(W * H);
let tl = [0, 0], tr = [0, 0], br = [0, 0], bl = [0, 0], n = 0;
const best = [Infinity, -Infinity, -Infinity, -Infinity];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!isGreen((y * W + x) * 3)) continue;
  mask[y * W + x] = 1; n++;
  if (x + y < best[0]) { best[0] = x + y; tl = [x, y]; }
  if (x - y > best[1]) { best[1] = x - y; tr = [x, y]; }
  if (x + y > best[2]) { best[2] = x + y; br = [x, y]; }
  if (y - x > best[3]) { best[3] = y - x; bl = [x, y]; }
}
if (n < 2000) throw new Error("找不到綠幕螢幕");
console.log("綠幕", n, "像素；四角", JSON.stringify({ tl, tr, br, bl }));
// 綠幕邊緣外擴 2px，蓋掉反鋸齒的綠邊
const grow = new Uint8Array(mask);
for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) if (!mask[y * W + x]) {
  for (let dy = -2; dy <= 2 && !grow[y * W + x]; dy++) for (let dx = -2; dx <= 2; dx++) if (mask[(y + dy) * W + x + dx]) {
    const i = (y * W + x) * 3, g = data[i + 1]; if (g > data[i] && g > data[i + 2]) { grow[y * W + x] = 1; break; }
  }
}
const tmp = mkdtempSync(join(tmpdir(), "mock-"));
const warped = join(tmp, "warped.png");
const f = [tl, tr, bl, br].map(([x, y], i) => `x${i}=${x}:y${i}=${y}`).join(":");
execFileSync("/opt/homebrew/bin/ffmpeg", ["-v", "error", "-y", "-i", uiPath, "-vf", `scale=${W}:${H}:flags=lanczos,perspective=${f}:sense=destination:interpolation=cubic`, "-frames:v", "1", warped]);
const ui = await sharp(warped).removeAlpha().raw().toBuffer();
const out = Buffer.from(data);
for (let p = 0; p < W * H; p++) if (grow[p]) { const i = p * 3; out[i] = ui[i]; out[i + 1] = ui[i + 1]; out[i + 2] = ui[i + 2]; }
await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toFile(outPath);
console.log("ok", outPath);
