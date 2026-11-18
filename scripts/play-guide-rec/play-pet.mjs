// 摸貓示範路線（2026-11-18 渝茜：要看得到左下角的搖桿）：先摸頭三輪 → 停一下看煩躁 → 推搖桿轉一下視角 → 再摸一輪
const run = async ({ p, M, wait, glide }) => {
  await M.move(450, 640); await wait(1200);
  const stroke = async (n) => {
    for (let r = 0; r < n; r++) {
      await glide(372, 250, 15); await M.down();
      await M.move(392, 258, { steps: 30 }); await wait(150); await M.move(372, 250, { steps: 30 }); await wait(150);
      await M.up(); await wait(700);
    }
  };
  await stroke(3);
  await glide(470, 590, 15); await wait(2200);  // 停手，看下面的開心、煩躁
  await glide(265, 425, 15); await M.down(); await M.move(310, 425, { steps: 20 }); await wait(1300); await M.move(265, 425, { steps: 10 }); await M.up(); await wait(600);
  await stroke(2);
  console.log(await p.evaluate(() => document.body.innerText.match(/開心\s*\d+/)?.[0]));
};
export default run;
