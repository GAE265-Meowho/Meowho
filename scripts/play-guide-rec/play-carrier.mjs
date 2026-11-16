const run = async ({ p, M, wait, glide, btn, center }) => {
  await M.move(450, 640); await wait(1000);
  const b = await btn("開始"); await glide(...center(b)); await wait(300); await M.down(); await M.up(); await wait(1000);
  const sx = x => 192 + x * 516 / 360, fy = 203 + 196 * 516 / 360;
  for (const x of [100, 140, 172, 205, 236, 300]) {
    await glide(sx(x), fy, 12); await wait(200); await M.down(); await M.up();
    for (let i = 0; i < 30; i++) { await wait(200); if (await p.evaluate(() => !document.querySelector("#ctreat")?.innerHTML)) break; }
    await wait(500);
  }
  await wait(2500);
};
export default run;
