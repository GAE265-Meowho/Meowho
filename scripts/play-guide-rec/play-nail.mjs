// 剪指甲（照片特寫版 NailGame2D，#404）：電腦玩法＝點一下肉球固定（指甲伸出來）→ 滑鼠移到白色尖端 → 按一下剪。剪中間兩根。
// 座標用 SVG 的 getScreenCTM 換算（腳趾、指甲位置同 lib/play/mini3d/nail-paw.ts 的 PAW_TOES、clawPoint），版面改了也對得到。
const TOES = [{ pad: [135, 139], base: [133, 91], angle: -6 }, { pad: [192, 137], base: [190, 87], angle: 6 }];
const CLAW_LEN = 54, DEPTH = 0.3;  // 0＝尖端、1＝根部；血線在 0.55，0.3 是白色尖端偏裡一點（剪得剛好）
const run = async ({ p, M, wait, glide, btn, center }) => {
  await M.move(450, 600); await wait(1000);
  const b = await btn("開始"); if (b) { await glide(...center(b)); await wait(300); await M.down(); await M.up(); await wait(1200); }
  const toScreen = (x, y) => p.evaluate(([x, y]) => {
    const svg = document.querySelector("svg[aria-label*='腳掌']"); const m = svg.getScreenCTM();
    const q = new DOMPoint(x, y).matrixTransform(m); return [q.x, q.y];
  }, [x, y]);
  for (const t of TOES) {
    const a = t.angle * Math.PI / 180, along = CLAW_LEN * (1 - DEPTH);
    const pad = await toScreen(...t.pad), tip = await toScreen(t.base[0] + along * Math.sin(a), t.base[1] - along * Math.cos(a));
    await glide(...pad, 15); await wait(300); await M.down(); await M.up(); await wait(900);   // 點肉球：指甲伸出來
    await glide(...tip, 14); await wait(500); await M.down(); await wait(120); await M.up(); await wait(1300);  // 指甲刀移到尖端，按一下剪
  }
  await wait(600);
};
export default run;
