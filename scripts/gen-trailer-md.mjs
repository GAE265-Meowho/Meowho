#!/usr/bin/env node
// 前導影片腳本下載（#498）：把 docs/video 的 v3 原稿包成 TS 字串，讓 /MeowHQ/videos 的「下載最新腳本」直接給檔案。
// predev／prebuild 會自動跑；改了 docs/video 原稿後也可手動 `npm run video:md`。trailer-md.test.ts 會擋下沒同步的情況。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "docs/video/前導影片分鏡腳本_v3.md");
const out = join(root, "src/lib/hq/videos/trailer-md.generated.ts");

const md = readFileSync(src, "utf8");
const body = `// 自動產生，請勿手改：來源 docs/video/前導影片分鏡腳本_v3.md（npm run video:md）
export const TRAILER_MD = ${JSON.stringify(md)};
`;
let prev = "";
try { prev = readFileSync(out, "utf8"); } catch { /* 第一次產生 */ }
if (prev !== body) writeFileSync(out, body);
