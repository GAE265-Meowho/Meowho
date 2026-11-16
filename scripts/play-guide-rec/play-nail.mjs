// 剪指甲示範（2026-11-16 重錄：照片特寫的雙手玩法，Tina #404）。
// 電腦玩法：點一下肉球固定（指甲伸出來）→ 滑鼠移到白色尖端（血線前）按一下就剪。剪兩根。
// 座標從頁面上的腳掌 SVG 換算（viewBox 320×320），對位資料同 lib/play/mini3d/nail-paw.ts。
const TOES = [
  { pad: { x: 87, y: 194 }, base: { x: 73, y: 144 }, angle: -24 },
  { pad: { x: 135, y: 139 }, base: { x: 133, y: 91 }, angle: -6 },
  { pad: { x: 192, y: 137 }, base: { x: 190, y: 87 }, angle: 6 },
  { pad: { x: 235, y: 187 }, base: { x: 251, y: 142 }, angle: 24 },
];
const LEN = 54;
/** 剪的位置：0＝尖端、1＝根部；0.36 在「剛好」範圍（0.14～0.55）裡、靠近最佳 0.38 */
const DEPTH = 0.36;
const clawPoint = (toe, depth) => {
  const t = TOES[toe], a = (t.angle * Math.PI) / 180, along = LEN * (1 - depth);
  return { x: t.base.x + along * Math.sin(a), y: t.base.y - along * Math.cos(a) };
};

const run = async ({ p, M, wait, glide, btn, center }) => {
  await M.move(450, 640); await wait(900);
  const start = await btn("開始");
  if (start) { await glide(...center(start)); await wait(300); await M.down(); await M.up(); await wait(1200); }
  /** viewBox 座標 → 螢幕座標 */
  const screen = async ({ x, y }) => p.evaluate((x, y) => {
    const svg = document.querySelector("svg[aria-label*=腳掌]");
    const m = svg.getScreenCTM(); const q = new DOMPoint(x, y).matrixTransform(m);
    return [q.x, q.y];
  }, x, y);
  for (const toe of [1, 2]) {
    await glide(...await screen(TOES[toe].pad), 16); await wait(350);
    await M.down(); await M.up(); await wait(1000);  // 點肉球：指甲伸出來
    await glide(...await screen(clawPoint(toe, DEPTH)), 18); await wait(700);  // 指甲刀對準白色尖端
    await M.down(); await M.up(); await wait(1500);  // 喀
    console.log(toe, await p.evaluate(() => document.querySelector("[role=status]")?.textContent));
  }
  await glide(450, 640, 12); await wait(600);
};
export default run;
