// 前導影片第三段（鏡 15–24）的系統錄影：照分鏡在正式站操作真實產品，錄成 $OUT/<段>.webm，並截下系統錄影格要用的畫面。
// 用法：S=<放 profile-mid／profile-adopter 的資料夾> OUT=<輸出資料夾> node rec-trailer.mjs <段> [<段> …]
// 段：form（準備：中途複製妹妹的問卷，不錄）build phone find home play apply chat transfer accept
// 兩個帳號的登入由組員自己在 Edge 設定檔裡完成（Google 登入），腳本只沿用登入狀態，不碰帳密。
// 準備：1. 在任一資料夾 `npm i playwright-core@1.56.1`（repo 不裝，避免拖慢 CI），把本檔放在那裡執行；需要 Microsoft Edge 與 Homebrew 的 ffmpeg。
//       2. 開兩個獨立 Edge 設定檔：open -na "Microsoft Edge" --args --user-data-dir=$S/profile-mid（另一個 profile-adopter），各自登入後 Cmd+Q。
//       3. 錄好後在 repo 根目錄 `npm run trailer:upload -- $OUT`（加 --apply 才上傳）。
// 錄影用 CDP 畫面串流逐格存 JPEG 再用 ffmpeg 組成 30fps（Playwright 內建錄影在 Edge 不出檔）。
// 會真的改到正式站：form 會開放問卷、play 會建領養任務紀錄、apply 會送出問卷、chat 會發訊息、transfer／accept 會移轉貓。
import { chromium } from "playwright-core";
import { mkdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const S = process.env.S, OUT = process.env.OUT ?? `${S}/out`;
mkdirSync(OUT, { recursive: true });
const BASE = "https://meowho.vercel.app";
const CAT = process.env.CAT ?? "0712f864-e914-483c-9b79-b719242eb664";       // 子哲中途的 cookie（錄影用複製貓）
const HOME = process.env.HOME_ID ?? "592cbfa2-34be-4052-8fc7-d3dfed839dc8";  // 子哲個人（演小傑）
const EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const DESKTOP = { width: 1600, height: 900 }, PHONE = { width: 390, height: 844 };
const log = (...a) => { const s = `[${new Date().toLocaleTimeString("zh-TW", { hour12: false })}] ${a.join(" ")}`; console.log(s); appendFileSync(`${OUT}/rec.log`, s + "\n"); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// 滑鼠游標：白色箭頭，按下時尖端有橘色波紋（同 scripts/play-guide-rec/rec.mjs）
const CURSOR = () => {
  const add = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div"); c.id = "__cur";
    c.style.cssText = "position:fixed;left:-80px;top:-80px;width:44px;height:52px;pointer-events:none;z-index:2147483647";
    c.innerHTML = `<span style="position:absolute;left:-20px;top:-20px;width:40px;height:40px;border-radius:50%;background:rgba(232,120,40,.55);transform:scale(0);transition:transform .12s,opacity .12s;opacity:0"></span><svg width="30" height="40" viewBox="0 0 17 23" style="position:absolute;left:-2px;top:-1px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.45))"><path d="M1 1v17.5l4.4-4.2 2.9 6.8 3-1.3-2.9-6.6H15z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    document.documentElement.appendChild(c);
    const ring = c.firstElementChild;
    addEventListener("pointermove", e => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("pointerdown", () => { ring.style.transform = "scale(1)"; ring.style.opacity = "1"; }, true);
    addEventListener("pointerup", () => { ring.style.transform = "scale(0)"; ring.style.opacity = "0"; }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", add); else add();
};

async function open(role, name, { phone = false, record = true } = {}) {
  const vp = phone ? PHONE : DESKTOP;
  const dir = `${OUT}/.tmp-${name}`;
  const ctx = await chromium.launchPersistentContext(`${S}/profile-${role}`, {
    executablePath: EDGE, headless: true, ignoreDefaultArgs: ["--use-mock-keychain", "--password-store=basic"],
    viewport: vp, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone,
    args: ["--ignore-gpu-blocklist"],
  });
  if (!phone) await ctx.addInitScript(CURSOR);
  const p = ctx.pages()[0] ?? await ctx.newPage();
  p.on("pageerror", e => log(name, "pageerror", e.message.slice(0, 120)));
  // 錄影：用 CDP 畫面串流逐格存 JPEG（Playwright 內建錄影在這台的 Edge 不出檔），結束時依時間戳組成 30fps 影片
  const frames = [];
  let cdp = null;
  if (record) {
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    cdp = await ctx.newCDPSession(p);
    cdp.on("Page.screencastFrame", async f => {
      const n = `${dir}/${String(frames.length).padStart(6, "0")}.jpg`;
      writeFileSync(n, Buffer.from(f.data, "base64")); frames.push({ n, t: f.metadata.timestamp });
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    const sz = phone ? { maxWidth: 780, maxHeight: 1688 } : { maxWidth: vp.width, maxHeight: vp.height };
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 1, ...sz });
  }
  const glide = async (x, y) => { await p.mouse.move(x, y, { steps: 18 }); };
  // 移到元素再點：看起來像真人操作
  const tap = async (loc, pause = 500) => {
    const el = typeof loc === "string" ? p.getByRole("button", { name: loc }).or(p.getByRole("link", { name: loc })).first() : loc;
    await el.scrollIntoViewIfNeeded({ timeout: 15000 });
    const b = await el.boundingBox();
    if (b && !phone) { await glide(b.x + b.width / 2, b.y + b.height / 2); await wait(250); }
    if (phone) await el.tap({ timeout: 10000 }); else await el.click({ timeout: 10000 }).catch(() => el.click({ force: true, timeout: 5000 }));
    await wait(pause);
  };
  const scroll = async (dy, steps = 12) => { for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dy / steps); await wait(60); } };
  const type = async (loc, text) => { await tap(loc, 200); await p.keyboard.type(text, { delay: 70 }); };
  const shot = async n => { await p.screenshot({ path: `${OUT}/${n}.png` }); log(name, "截圖", n); };
  const done = async () => {
    if (cdp) { await cdp.send("Page.stopScreencast").catch(() => {}); await wait(300); }
    await ctx.close();
    if (frames.length) {
      const end = frames.at(-1).t + 1;
      const list = frames.map((f, i) => `file '${f.n}'\nduration ${((frames[i + 1]?.t ?? end) - f.t).toFixed(3)}`).join("\n") + `\nfile '${frames.at(-1).n}'\n`;
      writeFileSync(`${dir}/list.txt`, list);
      execFileSync("/opt/homebrew/bin/ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${OUT}/${name}.mp4`]);
      rmSync(dir, { recursive: true, force: true });
      log(name, "錄好", `${name}.mp4`, `${frames.length} 格`, `${(end - frames[0].t).toFixed(1)} 秒`);
    }
  };
  const go = async path => { await p.goto(BASE + path, { waitUntil: "networkidle", timeout: 90000 }).catch(e => log(name, "goto", e.message.slice(0, 80))); await wait(2500); };
  return { p, ctx, glide, tap, scroll, type, shot, done, go };
}

const has = async (p, re) => re.test(await p.innerText("body").catch(() => ""));

const STAGES = {
  // 準備（不錄）：中途替 cookie 複製妹妹的問卷
  async form() {
    const r = await open("mid", "form", { record: false });
    await r.go(`/cats/${CAT}/edit`);
    if (await has(r.p, /複製「妹妹」的問卷/)) {
      await r.tap("複製「妹妹」的問卷", 2500);
      const save = r.p.getByRole("button", { name: /建立並開放問卷|儲存問卷/ }).first();
      if (await save.count()) await r.tap(save, 2500);
    }
    await r.shot("prep-form");
    log("form", (await r.p.innerText("main")).match(/領養問卷[\s\S]{0,200}/)?.[0].replace(/\n+/g, " ") ?? "");
    await r.done();
  },

  // 鏡 15 ① 建貓：中途看 cookie 的建檔流程，最後到貓咪頁看 3D 分身
  async build() {
    const r = await open("mid", "s15-build");
    await r.go(`/cats/${CAT}/edit`); await wait(1500);
    await r.scroll(500); await wait(800); await r.scroll(-500); await wait(600);
    for (const step of ["說說牠", "補資料", "確認"]) {
      const b = r.p.getByRole("button", { name: step, exact: true }).first();
      if (await b.count()) { await r.tap(b, 2200); await r.scroll(600); await wait(900); await r.scroll(-600); }
    }
    await r.shot("s15-build-confirm");
    await r.go(`/cats/${CAT}`); await wait(2000);
    const m = r.p.getByText(/3D 的/).first();
    if (await m.count()) { await m.scrollIntoViewIfNeeded(); await wait(6000); }
    await r.shot("s15-cat-3d");
    await r.scroll(700); await wait(1500);
    await r.done();
  },

  // 鏡 15 後半：小傑手機打開同一張介紹頁
  async phone() {
    const r = await open("adopter", "s15-phone", { phone: true });
    await r.go(`/cats/${CAT}`); await wait(2500);
    for (let i = 0; i < 4; i++) { await r.p.mouse.wheel(0, 350); await wait(1200); }
    await r.shot("s15-phone");
    await r.done();
  },

  // 鏡 16 ② 幫我找貓
  async find() {
    const r = await open("adopter", "s16-find");
    await r.go("/find"); await wait(1200);
    await r.type(r.p.locator("#find-input"), "上班族，白天不在家，想要安靜一點的貓");
    await wait(500); await r.tap(r.p.locator("form button[type=submit]"), 500);
    for (let i = 0; i < 25 && !(await has(r.p, /為什麼推薦/)); i++) await wait(1000);
    await wait(4000);
    await r.shot("s16-find");
    // 捲到子哲中途（蘆洲區）的 cookie
    const card = r.p.locator("article, li, section").filter({ hasText: "cookie" }).filter({ hasText: "蘆洲區" }).last();
    if (await card.count()) { await card.scrollIntoViewIfNeeded(); await wait(2500); await r.shot("s16-find-cookie"); }
    await wait(1500);
    await r.done();
  },

  // 鏡 17 ③ 拍自家影片：我家的 3D 房間＋安全檢測的電線
  async home() {
    const r = await open("adopter", "s17-home");
    await r.go(`/homes/${HOME}/scene`); await wait(8000);
    const ok = r.p.getByRole("button", { name: "知道了" }).first();
    if (await ok.count()) { await wait(1500); await r.tap(ok, 1500); }
    for (const v of ["左", "前", "右"]) { const b = r.p.getByRole("button", { name: v, exact: true }).first(); if (await b.count()) await r.tap(b, 2500).catch(e => log("home", "視角", v, e.message.slice(0, 50))); }
    await r.shot("s17-scene");
    await r.go(`/homes/${HOME}/safety`); await wait(2500);
    const cable = r.p.getByText(/電線與插座/).first();
    if (await cable.count()) { await cable.scrollIntoViewIfNeeded(); await wait(500); const b = await cable.boundingBox(); if (b) await r.glide(b.x + b.width / 2, b.y + 10); await wait(3000); }
    await r.shot("s17-safety-cable");
    await r.scroll(500); await wait(2000);
    await r.done();
  },

  // 鏡 18–21：領養任務（採買、擺用品、第 1 天等牠自己出來、一生時刻、試養報告）
  async play() {
    const r = await open("adopter", "s18-21-play");
    const p = r.p;
    await r.go(`/cats/${CAT}/play`); await wait(3000);
    if (await has(p, /再玩一次/)) await r.tap("再玩一次", 3500);
    const PRI = ["知道了", "略過", "帶cookie回家", "在旁邊等牠自己出來", "下一步", "開始", "取消", "結束今天，繼續故事", "繼續"];
    let lastSig = "", same = 0;
    const shots = new Set();
    for (let i = 0; i < 160; i++) {
      const body = await p.innerText("body").catch(() => "");
      if (/試養報告/.test(body) && /報告分析/.test(body)) break;
      // 卡住偵測：畫面文字連續 6 次沒變，按 Esc 並點取消／關閉
      const sig = body.slice(0, 400);
      same = sig === lastSig ? same + 1 : 0; lastSig = sig;
      if (same >= 6) { log("play", "卡住，按 Esc／取消"); await p.keyboard.press("Escape"); const x = p.getByRole("button", { name: /取消|關閉|知道了/ }).first(); if (await x.count()) await x.click({ timeout: 3000 }).catch(() => {}); same = 0; await wait(1500); continue; }
      if (!shots.has("shop") && /每月預算/.test(body) && /選飼料/.test(body)) { shots.add("shop"); await wait(1500); await r.shot("s18-shop"); }
      if (!shots.has("place") && /擺用品/.test(body) && /帶cookie回家/.test(body) && /✓/.test(body)) { shots.add("place"); await r.shot("s18-place"); }
      for (const [k, re] of [["half", /半年後/], ["y5", /五年後|5 年後/], ["y10", /10 年後|十年後/], ["bye", /道別|說再見/]]) if (!shots.has(k) && re.test(body)) { shots.add(k); await wait(1200); await r.shot(`s20-life-${k}`); }
      // 採買：挑第一款乾糧、濕糧；擺用品：依序點每個用品
      const acted = await p.evaluate(() => {
        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const foods = [...document.querySelectorAll("main button[aria-pressed]")].filter(b => vis(b) && /TWD/.test(b.textContent) && !b.disabled);
        for (const kw of ["乾糧", "濕糧"]) {
          if (foods.some(b => b.textContent.includes(kw) && b.getAttribute("aria-pressed") === "true")) continue;
          const f = foods.find(b => b.textContent.includes(kw)); if (f) { f.scrollIntoView({ block: "center" }); return { sel: "food", text: f.textContent.slice(0, 30) }; }
        }
        const item = [...document.querySelectorAll('[aria-label="要放的用品"] button')].find(b => vis(b) && !b.textContent.includes("✓"));
        if (item) return { sel: "item", text: item.textContent.trim() };
        return null;
      });
      if (acted) {
        const loc = acted.sel === "food" ? p.locator("main button[aria-pressed]").filter({ hasText: acted.text.slice(0, 12) }).first() : p.locator('[aria-label="要放的用品"] button').filter({ hasText: acted.text }).first();
        await r.tap(loc, 2200); continue;
      }
      const cands = await p.$$eval("button:not([disabled])", els => els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map(e => e.textContent.trim().replace(/\s+/g, " ")));
      let pick = null; for (const w of PRI) { pick = cands.find(c => c.includes(w)); if (pick) break; }
      if (!pick) { // 節點的選項：選第一個
        pick = cands.find(c => c.length > 3 && !/放棄|上一步|聲音|跟隨貓咪|轉向|你的家|採買|擺用品|飼養|報告|推薦|全部年齡/.test(c));
      }
      if (!pick) { await wait(1500); continue; }
      log("play", "→", pick.slice(0, 30));
      await r.tap(p.locator("button:visible").filter({ hasText: pick }).first(), pick.includes("下一步：預算") ? 3500 : 2600).catch(e => log("play", "點不到", pick, e.message.slice(0, 60)));
    }
    await wait(2500); await r.shot("s21-report");
    await r.scroll(700, 20); await wait(1500); await r.shot("s21-report-analysis"); await r.scroll(-700, 20); await wait(1000);
    await r.done();
  },

  // 鏡 22 ⑧ 提出領養：附上試養報告與問卷送出
  async apply() {
    const r = await open("adopter", "s22-apply");
    const p = r.p;
    await r.go(`/cats/${CAT}/apply`); await wait(2000);
    const A = { "自我介紹": "我是小傑，28 歲，在台北當 AI 導入顧問，想養貓想了兩年。", "職業": "AI 導入顧問，正職上班", "原因": "下班回家想有個伴，也做完了 cookie 的領養任務，知道自己準備好了。", "居住地區": "新北市蘆洲區", "疾病": "沒有", "經驗": "小時候家裡養過貓，這次做了領養任務先練習。" };
    for (let sec = 0; sec < 12; sec++) {
      if (!(await p.getByRole("button", { name: "下一段" }).count())) break;
      for (const ta of await p.locator("main textarea").all()) {
        const lab = await ta.evaluate(e => document.getElementById(e.getAttribute("aria-labelledby"))?.textContent ?? "");
        const key = Object.keys(A).find(k => lab.includes(k)) ?? "經驗";
        if (!(await ta.inputValue())) await r.type(ta, A[key]);
      }
      // 單選、是非：每組選第一個（是／第一個選項），年紀選 20–29 歲
      for (const g of await p.locator("main [role=radiogroup], main fieldset").all()) {
        const opts = g.locator("input[type=radio], button[aria-pressed], label");
        const pref = g.getByText(/20–29 歲|^是$|男|電梯大樓|租屋|整屋自由活動/).first();
        if (await pref.count()) await r.tap(pref, 250); else if (await opts.count()) await r.tap(opts.first(), 250);
      }
      const file = p.locator("main input[type=file]");
      if (await file.count()) { await file.first().setInputFiles(`${S}/shots/scene.png`); await wait(3000); }
      await r.tap("下一段", 1800);
    }
    await r.shot("s22-apply-review"); await r.scroll(600, 20); await wait(800);
    if (await p.getByRole("button", { name: "送出問卷" }).count()) await r.tap("送出問卷", 4000);
    await r.shot("s22-apply-sent");
    await r.done();
  },
  // 鏡 23 ⑨ 和中途對話：兩邊各錄一支（剪輯時左右分割），訊息照腳本「鏡 23 對話串內容」一來一回
  async chat() {
    const mid = await open("mid", "s23-chat-mid"), ad = await open("adopter", "s23-chat-adopter");
    const openThread = async r => {
      await r.go("/me/adoptions"); await wait(1500);
      const item = r.p.getByRole("button").filter({ hasText: "cookie" }).filter({ hasText: /子哲個人|黃子哲|子哲中途/ }).first();
      await r.tap(item.or(r.p.getByRole("link").filter({ hasText: "cookie" }).first()).first(), 2500);
    };
    await openThread(mid); await openThread(ad);
    const LINES = [
      [mid, "小傑你好，我看了你的試養報告。cookie很怕吹風機的聲音，你家附近會很吵嗎？"],
      [ad, "我住巷子裡，晚上很安靜。吹風機我會等牠習慣了再用，先在別的房間吹。"],
      [mid, "我看到第一天你選了等牠自己出來，為什麼？"],
      [ad, "牠剛到一定會怕，我想讓牠自己決定什麼時候出來。"],
      [mid, "那我們約個時間，你來見見cookie吧。"],
    ];
    for (const [r, text] of LINES) {
      const box = r.p.locator("textarea[aria-label^='傳訊息給']").first();
      await r.type(box, text); await wait(400);
      await r.tap(r.p.getByRole("button", { name: /傳送/ }).first(), 3500);
    }
    await wait(3000);
    await mid.shot("s23-chat-mid"); await ad.shot("s23-chat-adopter");
    await mid.done(); await ad.done();
  },

  // 鏡 24 ⑩ 移轉：中途按移轉、再輸入貓名並勾選已交接；小傑接收，貓咪頁紀錄分成中途時期與新家時期
  async transfer() {
    const mid = await open("mid", "s24-transfer-mid");
    await mid.go("/me/adoptions"); await wait(1500);
    await mid.tap(mid.p.getByRole("button").filter({ hasText: "cookie" }).filter({ hasText: /子哲個人|黃子哲/ }).first(), 2500);
    await mid.tap(mid.p.getByRole("button", { name: "移轉", exact: true }).first(), 2000);
    await mid.type(mid.p.locator("#transfer-name"), "cookie"); await wait(400);
    await mid.tap(mid.p.locator("input[type=checkbox]").last(), 800);
    await mid.shot("s24-transfer-confirm");
    await mid.tap(mid.p.getByRole("button", { name: "確認移轉" }), 4000);
    await mid.shot("s24-transfer-sent");
    await mid.done();
  },
  async accept() {
    const ad = await open("adopter", "s24-transfer-adopter");
    await ad.go("/me/adoptions"); await wait(1500);
    await ad.tap(ad.p.getByRole("button").filter({ hasText: "子哲中途" }).first(), 2500);
    await ad.tap(ad.p.getByRole("button", { name: "接收cookie" }), 1500);
    await ad.tap(ad.p.getByRole("button", { name: "確定接收cookie" }), 5000);
    await ad.shot("s24-transfer-accepted");
    await ad.go(`/cats/${CAT}`); await wait(3000);
    const era = ad.p.getByText(/中途時期|新家時期/).first();
    if (await era.count()) { await era.scrollIntoViewIfNeeded(); await wait(3000); }
    await ad.shot("s24-transfer-done");
    await ad.done();
  },
};

for (const s of process.argv.slice(2)) {
  if (!STAGES[s]) { log("沒有這一段：", s); continue; }
  log("開始", s);
  try { await STAGES[s](); } catch (e) { log(s, "失敗", e.message.split("\n")[0]); }
}
