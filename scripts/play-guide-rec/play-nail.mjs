const run = async ({ p, M, wait, glide, btn, center }) => {
  await M.move(450, 600); await wait(1000);
  const b = await btn("開始"); await glide(...center(b)); await wait(300); await M.down(); await M.up(); await wait(1200);
  for (const [x, y] of [[397, 335], [450, 322]]) {
    await glide(x, y, 15); await wait(300); await M.down(); await M.up(); await wait(900);
    await glide(x + 1, y - 44, 10); await wait(400); await M.down(); await M.up(); await wait(1200);
    console.log(await p.evaluate(() => document.querySelector("[id$=mmsg], #mmsg")?.textContent));
  }
};
export default run;
