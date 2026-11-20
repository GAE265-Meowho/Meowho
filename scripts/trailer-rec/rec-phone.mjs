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

// 錄影時藏起 11/19 16:30 之後的訊息（11/19 的移轉系統訊息與 11/20 的退養紀錄），只改畫面、不改資料
const hideLater = async p => p.route(/\/rest\/v1\/meow_messages\?/, async route => {
  if (route.request().method() !== "GET") return route.continue();
  const res = await route.fetch(); let body = await res.text();
  try { const j = JSON.parse(body); if (Array.isArray(j)) body = JSON.stringify(j.filter(m => !m.created_at || m.created_at < "2026-11-19T08:30:00Z")); } catch {}
  return route.fulfill({ response: res, body });
});

// 手機版錄影改用連續截圖（CDP 畫面串流在手機模擬下只拍到左上角），每格存 JPEG，結束時依時間戳組成 30fps
import { mkdirSync as _mk, writeFileSync as _wf, rmSync as _rm } from "node:fs";
import { execFileSync as _ex } from "node:child_process";
async function openPhone(role, name) {
  const r = await open(role, name, { phone: true, record: false });
  const dir = `${OUT}/.tmp-${name}`; _rm(dir, { recursive: true, force: true }); _mk(dir, { recursive: true });
  const frames = []; let on = true;
  const loop = (async () => { while (on) { const t = Date.now() / 1000; try { const b = await r.p.screenshot({ type: "jpeg", quality: 85 }); const n = `${dir}/${String(frames.length).padStart(6, "0")}.jpg`; _wf(n, b); frames.push({ n, t }); } catch { await wait(50); } } })();
  const origDone = r.done;
  r.done = async () => {
    on = false; await loop; await origDone();
    if (!frames.length) return;
    const end = frames.at(-1).t + 0.1;
    const list = frames.map((f, i) => `file '${f.n}'\nduration ${((frames[i + 1]?.t ?? end) - f.t).toFixed(3)}`).join("\n") + `\nfile '${frames.at(-1).n}'\n`;
    _wf(`${dir}/list.txt`, list);
    _ex("/opt/homebrew/bin/ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-vf", "fps=30,scale=780:1688,setsar=1", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${OUT}/${name}.mp4`]);
    _rm(dir, { recursive: true, force: true });
    log(name, "錄好（截圖）", `${frames.length} 格`, `${(end - frames[0].t).toFixed(1)} 秒`);
  };
  return r;
}

// 11/20 補錄小傑手機版（子哲要求）：用法同 rec.mjs，段：pfind phome papply pchat2 paccept2（reopen＝中途重新開放問卷）
// 鏡 16、17、22、23 只看、只打字、不送出；papply 攔下草稿與照片上傳、pchat2／paccept2 藏起 11/19 16:30 之後的訊息、
// paccept2 模擬一筆待接收的移轉並攔下接收 RPC：都只改錄影畫面，不寫資料庫。transfer 段會真的移轉（這串已移轉過，目前不能用）。
const STAGES = {
  async reopen() {
    const r = await open("mid", "x-reopen", { record: false });
    await r.go(`/cats/${CAT}/edit`); await wait(2500);
    const b = r.p.getByRole("button", { name: "重新開放" }).first();
    if (await b.count()) { await r.tap(b, 2500); const c = r.p.getByRole("button", { name: /確定|確認|重新開放/ }).last(); if (await c.count()) await r.tap(c, 2500).catch(() => {}); }
    log("reopen", (await r.p.innerText("main")).match(/領養問卷[^\n]*\n?[^\n]*/)?.[0]?.replace(/\n/g, " ") ?? "");
    await r.done();
  },
  async pchat2() {
    const r = await openPhone("adopter", "p23-chat-adopter");
    await hideLater(r.p);
    await r.go("/me/adoptions"); await wait(2000);
    const item = r.p.getByRole("button").filter({ hasText: "cookie" }).filter({ hasText: /子哲中途/ }).first();
    await r.tap(item.or(r.p.getByRole("link").filter({ hasText: "cookie" }).first()).first(), 3000);
    await r.p.evaluate(() => { const el = [...document.querySelectorAll("p, li, div")].find(e => e.children.length === 0 && /吹風機的聲音/.test(e.textContent)); el?.scrollIntoView({ block: "start" }); });
    await wait(1500);
    await r.p.evaluate(async () => { const el = [...document.querySelectorAll("p, li, div")].find(e => e.children.length === 0 && /見見cookie/.test(e.textContent)); el?.scrollIntoView({ behavior: "smooth", block: "end" }); });
    await wait(4000);
    await r.shot("p23-chat-dialog");
    const box = r.p.locator("textarea[aria-label^='傳訊息給']").first();
    if (await box.count()) { await r.type(box, "好，我週末有空，想去見見cookie。"); await wait(2000); await box.fill(""); }
    log("pchat2", "只打字不送出");
    await wait(800); await r.done();
  },
  // 鏡 24 小傑接收：這串對話 11/19 已移轉過（homed_at 有值），中途不能再移轉。錄影時讓小傑的頁面以為有一筆待接收的移轉，
  // 按「確定接收」的 RPC 也攔下來，不寫資料庫（cookie 留在子哲中途，不用再退養）
  async paccept2() {
    const ad = await openPhone("adopter", "p24-transfer-adopter");
    const p = ad.p; let accepted = false;
    await hideLater(p);
    await p.route(/\/rest\/v1\/meow_cat_transfers\?/, async route => {
      const obj = /vnd\.pgrst\.object/.test(route.request().headers()["accept"] ?? "");
      const row = { id: "00000000-0000-4000-8000-0000000000aa", to_member_id: "x" };
      const body = accepted ? (obj ? "null" : "[]") : (obj ? JSON.stringify(row) : JSON.stringify([row]));
      return route.fulfill({ status: 200, contentType: "application/json", body });
    });
    await p.route(/\/rest\/v1\/rpc\/meow_(accept|decline)_transfer/, async route => { accepted = true; log("paccept2", "攔下接收 RPC"); return route.fulfill({ status: 200, contentType: "application/json", body: "null" }); });
    await ad.go("/me/adoptions"); await wait(2000);
    await ad.tap(p.getByRole("button").filter({ hasText: "子哲中途" }).first(), 3000);
    await wait(2500); await ad.shot("p24-before-accept");
    await ad.tap(p.getByRole("button", { name: "接收cookie" }), 2200);
    await ad.shot("p24-confirm");
    await ad.tap(p.getByRole("button", { name: "確定接收cookie" }), 4000);
    await ad.shot("p24-accepted");
    await wait(1500); await ad.done();
  },
  async pfind() {
    const r = await openPhone("adopter", "p16-find");
    // 11/20 退養留下的中途日記「退養回到中途」不能出現在畫面：只在錄影時把含「退養」的日記拿掉
    await r.p.route(/\/api\/find$/, async route => {
      const res = await route.fetch(); let body = await res.text();
      try { const strip = o => { if (Array.isArray(o)) o.forEach(strip); else if (o && typeof o === "object") for (const k of Object.keys(o)) { if (k === "diary" && typeof o[k] === "string" && /退養/.test(o[k])) o[k] = null; else strip(o[k]); } }; const j = JSON.parse(body); strip(j); body = JSON.stringify(j); } catch {}
      return route.fulfill({ response: res, body });
    });
    await r.go("/find"); await wait(1500);
    await r.type(r.p.locator("#find-input"), "上班族，白天不在家，想要安靜一點的貓");
    await wait(600); await r.tap(r.p.locator("form button[type=submit]"), 500);
    for (let i = 0; i < 30 && !(await has(r.p, /為什麼推薦/)); i++) await wait(1000);
    await wait(3000); await r.shot("p16-find");
    const card = r.p.locator("article, li, section").filter({ hasText: "cookie" }).filter({ hasText: "蘆洲區" }).last();
    if (await card.count()) { await card.scrollIntoViewIfNeeded(); await wait(3000); await r.shot("p16-find-cookie"); }
    await wait(1500); await r.done();
  },
  async phome() {
    const r = await openPhone("adopter", "p17-home");
    await r.go(`/homes/${HOME}/scene`); await wait(9000);
    const ok = r.p.getByRole("button", { name: "知道了" }).first();
    if (await ok.count()) { await wait(1500); await r.tap(ok, 1500); }
    for (const v of ["左", "前", "右"]) { const b = r.p.getByRole("button", { name: v, exact: true }).first(); if (await b.count()) await r.tap(b, 2500).catch(e => log("phome", "視角", v, e.message.slice(0, 50))); }
    await r.shot("p17-scene");
    await r.go(`/homes/${HOME}/safety`); await wait(2500);
    const cable = r.p.getByText(/電線與插座/).first();
    if (await cable.count()) { await cable.scrollIntoViewIfNeeded(); await wait(3500); }
    await r.shot("p17-safety-cable");
    for (let i = 0; i < 3; i++) { await r.p.mouse.wheel(0, 300); await wait(1200); }
    await r.done();
  },
  async papply() {
    const r = await openPhone("adopter", "p22-apply");
    const p = r.p;
    // 11/19 已真的送出過問卷：錄影時讓頁面以為還沒填，草稿與照片上傳也攔下來，不寫資料庫
    await p.route(/\/rest\/v1\/meow_adoption_responses/, async route => {
      const m = route.request().method();
      if (m === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      log("papply", "攔下", m); return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000000" }) });
    });
    await p.route(/\/storage\/v1\/object\//, async route => {
      if (route.request().method() === "GET") return route.continue();
      log("papply", "攔下照片上傳"); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "x", Id: "x" }) });
    });
    await r.go(`/cats/${CAT}/apply`); await wait(2500);
    await r.shot("p22-apply-start");
    const A = { "自我介紹": "我是小傑，28 歲，在台北當 AI 導入顧問，想養貓想了兩年。", "職業": "AI 導入顧問，正職上班", "原因": "下班回家想有個伴，也做完了 cookie 的領養任務，知道自己準備好了。", "居住地區": "新北市蘆洲區", "疾病": "沒有", "經驗": "小時候家裡養過貓，這次做了領養任務先練習。" };
    for (let sec = 0; sec < 12; sec++) {
      if (!(await p.getByRole("button", { name: "下一段" }).count())) break;
      for (const ta of await p.locator("main textarea").all()) {
        const lab = await ta.evaluate(e => document.getElementById(e.getAttribute("aria-labelledby"))?.textContent ?? "");
        const key = Object.keys(A).find(k => lab.includes(k)) ?? "經驗";
        if (!(await ta.inputValue())) await r.type(ta, A[key]);
      }
      for (const g of await p.locator("main [role=radiogroup], main fieldset").all()) {
        const opts = g.locator("input[type=radio], button[aria-pressed], label");
        const pref = g.getByText(/20–29 歲|^是$|男|電梯大樓|租屋|整屋自由活動/).first();
        if (await pref.count()) await r.tap(pref, 250).catch(() => {}); else if (await opts.count()) await r.tap(opts.first(), 250).catch(() => {});
      }
      const file = p.locator("main input[type=file]");
      if (await file.count()) { await file.first().setInputFiles(`${S}/shots/scene.png`).catch(() => {}); await wait(3000); }
      await r.tap("下一段", 1800);
    }
    await r.shot("p22-apply-review");
    for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, 300); await wait(1000); }
    log("papply", "停在送出前，不按送出");
    await wait(1500); await r.done();
  },
  async pchat() {
    const r = await openPhone("adopter", "p23-chat-adopter");
    await r.go("/me/adoptions"); await wait(2000);
    const item = r.p.getByRole("button").filter({ hasText: "cookie" }).filter({ hasText: /子哲中途/ }).first();
    await r.tap(item.or(r.p.getByRole("link").filter({ hasText: "cookie" }).first()).first(), 3000);
    await r.shot("p23-chat-thread");
    for (let i = 0; i < 4; i++) { await r.p.mouse.wheel(0, -250); await wait(1100); }
    for (let i = 0; i < 4; i++) { await r.p.mouse.wheel(0, 250); await wait(1100); }
    const box = r.p.locator("textarea[aria-label^='傳訊息給']").first();
    if (await box.count()) { await r.type(box, "好，我週末有空，想去見見cookie。"); await wait(2000); await box.fill(""); }
    log("pchat", "只打字不送出");
    await r.shot("p23-chat-typed"); await wait(1000); await r.done();
  },
  // 真的移轉：中途（電腦版，畫面已有 rec-transfer-mid，不錄）→ 小傑手機接收
  async transfer() {
    const mid = await open("mid", "x-transfer", { record: false });
    await mid.go("/me/adoptions"); await wait(2000);
    await mid.tap(mid.p.getByRole("button").filter({ hasText: "cookie" }).filter({ hasText: /子哲個人|黃子哲/ }).first(), 2500);
    await mid.tap(mid.p.getByRole("button", { name: "移轉", exact: true }).first(), 2000);
    await mid.type(mid.p.locator("#transfer-name"), "cookie"); await wait(400);
    await mid.tap(mid.p.locator("input[type=checkbox]").last(), 800);
    await mid.tap(mid.p.getByRole("button", { name: "確認移轉" }), 4000);
    await mid.shot("x-transfer-sent");
    await mid.done();
  },
  async paccept() {
    const ad = await openPhone("adopter", "p24-transfer-adopter");
    await ad.go("/me/adoptions"); await wait(2000);
    await ad.tap(ad.p.getByRole("button").filter({ hasText: "子哲中途" }).first(), 2500);
    await ad.shot("p24-before-accept");
    await ad.tap(ad.p.getByRole("button", { name: "接收cookie" }), 1800);
    await ad.tap(ad.p.getByRole("button", { name: "確定接收cookie" }), 5000);
    await ad.shot("p24-accepted");
    await ad.go(`/cats/${CAT}`); await wait(3000);
    const era = ad.p.getByText(/中途時期|新家時期/).first();
    if (await era.count()) { await era.scrollIntoViewIfNeeded(); await wait(3500); }
    await ad.shot("p24-done");
    await ad.done();
  },
};
for (const s of process.argv.slice(2)) {
  if (!STAGES[s]) { log("沒有這一段：", s); continue; }
  log("開始", s);
  try { await STAGES[s](); } catch (e) { log(s, "失敗", e.message.split("\n")[0]); }
}
