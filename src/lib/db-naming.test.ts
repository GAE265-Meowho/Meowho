// 共用 Supabase 專案的命名守門測試（AGENTS.md §7.2）：程式裡用到的資料表、RPC、bucket 都必須以 meow 開頭
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PHOTO_BUCKET } from "./supabase/config";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}
const src = files(path.join(__dirname, "..")).map(f => readFileSync(f, "utf8")).join("\n");

describe("共用資料庫命名", () => {
  it("所有 .from() 資料表都以 meow_ 開頭", () => {
    const tables = [...src.matchAll(/\.from\("([^"]+)"\)/g)].map(m => m[1]).filter(t => t !== PHOTO_BUCKET);
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.filter(t => !t.startsWith("meow_"))).toEqual([]);
  });
  it("所有 RPC 都以 meow_ 開頭", () => {
    const rpcs = [...src.matchAll(/\.rpc\("([^"]+)"/g)].map(m => m[1]);
    expect(rpcs.filter(r => !r.startsWith("meow_"))).toEqual([]);
  });
  it("照片 bucket 以 meow- 開頭", () => {
    expect(PHOTO_BUCKET.startsWith("meow-")).toBe(true);
  });
  it("migration 不在 auth.users 上建立 trigger，也不建立非 meow_ 的資料表", () => {
    const dir = path.join(__dirname, "../../supabase/migrations");
    const sql = readdirSync(dir).map(f => readFileSync(path.join(dir, f), "utf8")).join("\n").replace(/--.*$/gm, "");
    expect(/create\s+trigger[^;]*\bon\s+auth\./i.test(sql)).toBe(false);
    const created = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/gi)].map(m => m[1]);
    expect(created.filter(t => !t.startsWith("meow_"))).toEqual([]);
  });
});
