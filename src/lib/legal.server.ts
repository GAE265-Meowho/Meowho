import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cleanLegalText } from "./terms";

/** 讀取 docs/spec/08 的條款全文並整理成純文字（建置時讀取） */
export async function loadLegalText(): Promise<string> {
  const raw = await readFile(path.join(process.cwd(), "docs/spec/08_隱私權政策與服務條款.md"), "utf8").catch(() => "");
  return raw ? cleanLegalText(raw) : "";
}
