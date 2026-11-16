const run = async ({ p, M, wait, glide }) => {
  await M.move(650, 560); await wait(1500);
  const mk = () => p.evaluate(() => { const c = document.querySelector("dialog[open] circle[class*=marker]"); const b = c?.getBoundingClientRect(); return b && [b.x + b.width / 2, b.y + b.height / 2]; });
  let r = await mk();
  await glide(r[0], r[1], 20); await wait(300); await M.down(); await wait(800); await M.up();
  for (let i = 0; i < 80; i++) { await wait(200); if (await p.evaluate(() => !document.querySelector("dialog[open]")?.innerText.includes("衛教示範"))) break; }
  await wait(600);
  r = await mk(); await glide(r[0], r[1], 6); await M.down();
  for (let i = 0; i < 50; i++) { await wait(200); const t = await p.evaluate(() => document.querySelector("dialog[open]")?.innerText.match(/進度\s*(\d+)%/)?.[1]); if (Number(t) >= 100) break; }
  await M.up(); await wait(1500);
  console.log(await p.evaluate(() => document.querySelector("dialog[open]")?.innerText.replace(/\s+/g, " ").slice(0, 160)));
};
export default run;
