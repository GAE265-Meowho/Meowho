// 把測試容器的檔案複製到正式容器（同一路徑）：
//   npm run media:promote -- cats/<貓 id>/            先列出會複製哪些（不動任何檔案）
//   npm run media:promote -- cats/<貓 id>/ --apply    真的複製
// 只補正式沒有的檔案，不覆蓋、不刪測試端。需要 .env.local 的 AZURE_STORAGE_ACCOUNT、AZURE_STORAGE_KEY。
// 容器預設 media-dev → media，可用 --from、--to 改。
import { readFileSync } from "node:fs";
// 專案是 CommonJS，要用動態 import 才拿得到 .ts 的具名匯出
const { createAzureStore } = await import("../src/lib/storage/azure.ts");
const { planPromotion, promote } = await import("../src/lib/storage/promote.ts");

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const fromName = flag("--from", "media-dev");
const toName = flag("--to", "media");
const apply = args.includes("--apply");
const prefixes = args.filter((a) => !a.startsWith("--"));

const { AZURE_STORAGE_ACCOUNT: account, AZURE_STORAGE_KEY: key } = process.env;
if (!account || !key) throw new Error(".env.local 缺 AZURE_STORAGE_ACCOUNT 或 AZURE_STORAGE_KEY");
if (fromName === toName) throw new Error("來源與目標是同一個容器");
if (!prefixes.length) throw new Error("請指定要複製的資料夾，例如 cats/<貓 id>/");

const from = createAzureStore({ provider: "azure", account, key, container: fromName });
const to = createAzureStore({ provider: "azure", account, key, container: toName });

const plan = await planPromotion(from, to, prefixes);
console.log(`${fromName} → ${toName}：要複製 ${plan.copy.length} 個，正式已有 ${plan.skip.length} 個（略過）`);
for (const p of plan.copy) console.log(`  + ${p}`);
if (!apply) {
  console.log("這次只是預覽。確認無誤後加上 --apply 再執行一次。");
} else {
  const r = await promote(from, to, plan, (p) => console.log(`  已複製 ${p}`));
  console.log(`完成：複製 ${r.copied} 個${r.missing.length ? `，測試端已不存在 ${r.missing.length} 個：${r.missing.join("、")}` : ""}`);
}
