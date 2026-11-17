export default async function run({ p, M, wait }) {
  const stage = '[aria-label="刷牙練習影像"]';
  await p.waitForSelector(stage + ' circle');
  await p.focus(stage);
  await wait(900);
  await p.keyboard.down("Space");
  try {
    await p.waitForSelector(stage + '[data-mouth="teeth"]');
    const targets = await p.$$eval('[aria-label="牙齒外側特寫"] ellipse', marks =>
      marks.map(mark => {
        const matrix = mark.getScreenCTM();
        const x = Number(mark.getAttribute("cx"));
        const y = Number(mark.getAttribute("cy"));
        const reach = Number(mark.getAttribute("rx")) * 0.6;
        return [-reach, reach].map(dx => new DOMPoint(x + dx, y).matrixTransform(matrix).toJSON());
      })
    );
    for (const [left, right] of targets) {
      await M.move(left.x, left.y);
      for (let i = 0; i < 5; i++) {
        await M.move(right.x, right.y, { steps: 3 });
        await wait(45);
        await M.move(left.x, left.y, { steps: 3 });
        await wait(45);
      }
    }
    await p.waitForFunction(() => document.querySelector("dialog progress")?.value > 0);
    console.log("brush progress", await p.$eval("dialog progress", meter => meter.value));
  } finally {
    await p.keyboard.up("Space");
  }
  await p.waitForSelector(stage + '[data-mouth="closed"]');
  await wait(950);
}
