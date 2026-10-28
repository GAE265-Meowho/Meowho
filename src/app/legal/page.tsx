import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";

export const metadata = { title: "隱私權政策與服務條款｜MeowHome" };

// 直接呈現 docs/spec/08 的條款全文（之後可換成正式排版）
export default async function LegalPage() {
  const text = await readFile(path.join(process.cwd(), "docs/spec/08_隱私權政策與服務條款.md"), "utf8").catch(() => "條款載入失敗");
  return (
    <main className="wrap legal">
      <p><Link href="/" className="more">← 回首頁</Link></p>
      <article className="legal-text">{text.replace(/[#>*|`]/g, "").replace(/\n{3,}/g, "\n\n")}</article>
    </main>
  );
}
