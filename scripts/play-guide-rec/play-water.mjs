const run = async ({ p, M, wait, glide, btn, center }) => {
  await M.move(450, 620); await wait(3500);
  // 菜瓜布在碗裡畫圈
  const cx = 530, cy = 380;
  await glide(cx + 40, cy); await M.down();
  for (let i = 0; i < 80; i++) {
    const a = i * 0.45; await M.move(cx + Math.cos(a) * 42, cy + Math.sin(a) * 20, { steps: 2 }); await wait(40);
    if (await p.evaluate(() => !document.body.innerText.includes("菜瓜布"))) break;
  }
  await M.up(); await wait(1600);
  let b = await btn("按住開水龍頭"); await glide(...center(b)); await wait(300);
  await M.down();
  for (let i = 0; i < 80; i++) { const v = await p.evaluate(() => Number(document.querySelector("dialog[open] progress")?.value ?? 0)); if (v <= 0) break; await wait(150); }
  await wait(300); await M.up(); await wait(2600);
  b = await btn("按住開水龍頭"); if (b) { await glide(...center(b)); await wait(300); await M.down();
    for (let i = 0; i < 60; i++) { const v = await p.evaluate(() => Number(document.querySelector("dialog[open] progress")?.value ?? 0)); if (v >= 72) break; await wait(120); }
    await M.up(); await wait(1200);
    b = await btn("倒好了"); await glide(...center(b)); await wait(400); await M.down(); await M.up(); }
};
export default run;
