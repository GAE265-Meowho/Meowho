import Link from "next/link";
import { PageBrandTitle, SiteFooter, SiteHeader } from "@/components/Chrome";
import { loadLegalText } from "@/lib/legal.server";

export const metadata = { title: "隱私權政策與服務條款｜Meowho喵戶" };

// 呈現 docs/spec/08 的條款全文（標題改由 PageBrandTitle 顯示）
export default async function LegalPage() {
  const text = (await loadLegalText()) || "條款載入失敗";
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
