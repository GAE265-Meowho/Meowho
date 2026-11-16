const run = async ({ p, M, wait, glide }) => {
  await M.move(450, 640); await wait(1500);
  for (let r = 0; r < 5; r++) {
    await glide(372, 250, 15); await M.down();
    await M.move(392, 258, { steps: 30 }); await wait(150); await M.move(372, 250, { steps: 30 }); await wait(150);
    await M.up(); await wait(900);
  }
  console.log(await p.evaluate(() => document.body.innerText.match(/開心\s*\d+/)?.[0]));
};
export default run;
