#!/usr/bin/env node
// 依 page-meta-map 的路徑對每個功能／tab 取 git 最後修改人與時間，寫入 page-meta.generated.json
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "src/lib/hq/page-meta.generated.json");
const mapPath = join(root, "src/lib/hq/page-meta-map.ts");

function formatTaipei(isoOrDate) {
  const at = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(at.getTime())) return formatTaipei(new Date());
  return at.toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).replace(/-/g, "/");
}

/** 從 page-meta-map.ts 抽出 HQ_PAGE_META_PATHS 物件（不跑 TS，避免建置依賴 tsx） */
function loadPathsFromMapTs() {
  const src = readFileSync(mapPath, "utf8");
  const start = src.indexOf("export const HQ_PAGE_META_PATHS = {");
  if (start < 0) throw new Error("HQ_PAGE_META_PATHS not found in page-meta-map.ts");
  const brace = src.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = brace; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error("unclosed HQ_PAGE_META_PATHS");
  const objSrc = src.slice(brace, end + 1)
    .replace(/as const satisfies[\s\S]*$/, "")
    .replace(/,(\s*[}\]])/g, "$1"); // trailing commas OK in JSON5-ish; use Function
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${objSrc});`)();
}

function gitLog(paths) {
  const existing = paths.filter(p => existsSync(join(root, p)));
  if (!existing.length) return null;
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%aN%x09%aI", "--", ...existing],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    if (!out) return null;
    const tab = out.indexOf("\t");
    if (tab < 0) return null;
    return { updatedBy: out.slice(0, tab).trim() || "unknown", versionDate: formatTaipei(out.slice(tab + 1).trim()) };
  } catch {
    return null;
  }
}

function loadPrev() {
  if (!existsSync(outPath)) return {};
  try {
    return JSON.parse(readFileSync(outPath, "utf8"));
  } catch {
    return {};
  }
}

const pathsByKey = loadPathsFromMapTs();
const prev = loadPrev();
const fallbackBy = process.env.NEXT_PUBLIC_HQ_UPDATED_BY
  || process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME
  || process.env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN
  || process.env.GITHUB_ACTOR
  || "unknown";
const fallbackDate = process.env.NEXT_PUBLIC_HQ_VERSION || formatTaipei(new Date());

const pages = {};
for (const [key, paths] of Object.entries(pathsByKey)) {
  const hit = gitLog(paths);
  if (hit) pages[key] = hit;
  else if (prev.pages?.[key]) pages[key] = prev.pages[key];
  else pages[key] = { updatedBy: fallbackBy, versionDate: fallbackDate };
}

const doc = {
  generatedAt: formatTaipei(new Date()),
  pages,
};

writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(`wrote ${outPath} (${Object.keys(pages).length} pages)`);

// silence unused in case bundlers look at import.meta
void pathToFileURL;
