// 建立或追加今天的每日紀錄：npm run log -- --by Tina --agent "Claude Code (claude-opus-5-5)" [--issue 12] [--module account]
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
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

const dir = new URL("../docs/daily/", import.meta.url);
const file = new URL(`${date}.md`, dir);
await mkdir(dir, { recursive: true });
if (!existsSync(file)) {
  await writeFile(file, `# ${date} 每日紀錄\n\n> 只追加、不改別人的紀錄；同日衝突時兩邊都保留。格式見 AGENTS.md §3.1。\n`);
}
const entry = `
### ${time}｜${args.by || "（發起人）"}（發起）× ${args.agent || "（AI 工具與模型）"}
- Issue：${args.issue ? `#${args.issue}` : "—"}
- 分支／PR：${branch || "—"}｜—
- 模組：${args.module || "—"}
- 做了什麼：
  -
- 決策：
- 未完成／下一步：
- 風險／地雷：
`;
await appendFile(file, entry);
console.log(`已追加到 docs/daily/${date}.md，請填寫內容。`);
