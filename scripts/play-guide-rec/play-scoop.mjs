const run = async ({ p, M, wait, glide }) => {
  await M.move(450, 640); await wait(1500);
  const bag = [300, 350];
  const clumps = [[427, 360], [525, 393], [465, 420], [585, 417]];
  for (const [x, y] of clumps.slice(0, 3)) {
    await glide(x + 25, y - 10, 15); await M.down();
    await M.move(x - 10, y + 4, { steps: 25 }); await wait(300);
    // 左右甩
    for (let i = 0; i < 4; i++) { await M.move(x + 18, y, { steps: 6 }); await wait(60); await M.move(x - 18, y, { steps: 6 }); await wait(60); }
    await wait(300);
    await M.move(...bag, { steps: 45 }); await wait(400); await M.up(); await wait(1200);
    const n = await p.evaluate(() => document.body.innerText.match(/清掉\s*(\d+)/)?.[1]); console.log("bagged", n);
  }
};
export default run;
