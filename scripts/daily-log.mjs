// 新增一筆每日紀錄（一筆一個檔，避免多張 PR 同時改同一個檔而衝突）：
// npm run log -- --by Tina --agent "Claude Code (claude-opus-5-5)" [--issue 12] [--module account]
// 產生 docs/daily/YYYY-MM-DD/HHMM-<發起人>[-<issue>].md
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1] ?? ""]] : acc), [])
);
const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
const pad = n => String(n).padStart(2, "0");
const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
let branch = "";
try { branch = execSync("git branch --show-current").toString().trim(); } catch { /* 非 git 環境 */ }

// 檔名只留中英數字與連字號，避免空白與特殊符號
const slug = s => String(s).trim().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "");
const parts = [time.replace(":", ""), slug(args.by || "") || "unknown"];
if (args.issue) parts.push(slug(args.issue));
const base = parts.join("-");

const dir = new URL(`../docs/daily/${date}/`, import.meta.url);
await mkdir(dir, { recursive: true });
let name = `${base}.md`;
for (let n = 2; existsSync(new URL(name, dir)); n++) name = `${base}-${n}.md`;

const entry = `### ${time}｜${args.by || "（發起人）"}（發起）× ${args.agent || "（AI 工具與模型）"}
- Issue：${args.issue ? `#${args.issue}` : "—"}
- 分支／PR：${branch || "—"}｜—
- 模組：${args.module || "—"}
- 做了什麼：
  -
- 決策：
- 未完成／下一步：
- 風險／地雷：
`;
await writeFile(new URL(name, dir), entry);
console.log(`已建立 docs/daily/${date}/${name}，請填寫內容。`);
