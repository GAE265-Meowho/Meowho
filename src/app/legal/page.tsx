import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { PageBrandTitle, SiteFooter, SiteHeader } from "@/components/Chrome";

export const metadata = { title: "隱私權政策與服務條款｜Meow Home" };

// 呈現 docs/spec/08 的條款全文（標題改由 PageBrandTitle 顯示）
export default async function LegalPage() {
  const raw = await readFile(path.join(process.cwd(), "docs/spec/08_隱私權政策與服務條款.md"), "utf8").catch(() => "條款載入失敗");
  const text = raw.replace(/^#\s.*\n/, "").replace(/[#>*|`]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return (
    <>
      <SiteHeader />
      <main className="wrap legal">
        <p><Link href="/" className="more">← 回首頁</Link></p>
        <PageBrandTitle title="隱私權政策與服務條款（簡版）" />
        <article className="legal-text">{text}</article>
      </main>
      <SiteFooter />
    </>
  );
}
