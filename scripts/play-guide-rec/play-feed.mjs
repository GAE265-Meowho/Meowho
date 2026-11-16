const run = async ({ M, wait, glide, btn, center }) => {
  await M.move(450, 600); await wait(1200);
  let b = await btn("乾飼料"); await glide(...center(b)); await wait(400); await M.down(); await M.up(); await wait(2200);
  b = await btn("按住倒乾飼料"); await glide(...center(b)); await wait(400);
  await M.down(); await wait(1500); await M.up(); await wait(1600);
  b = await btn("放好了"); await glide(...center(b)); await wait(500); await M.down(); await M.up();
};
export default run;
