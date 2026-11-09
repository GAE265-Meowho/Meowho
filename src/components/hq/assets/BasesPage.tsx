"use client";
// 3D 貓咪體型預覽（#302）：/MeowHQ/assets/bases?body=large|adult|kitten，大貓｜成貓｜幼貓三個分頁。
// 每個分頁都是完整的骨架測試台（播放與畫面、動作、眼睛、貓咪資訊）；分頁寫進網址，可直接分享。
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BASE_TABS, resolveBaseTab } from "@/lib/hq/cat-models/bases";
import { HqTabs } from "../list/HqList";
import { BaseLab } from "./BaseLab";
import { ASSETS_CATS_HREF } from "./hrefs";

export function BasesPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const body = resolveBaseTab(params.get("body"));
  return (
    <>
      <div className="hq-pagehead">
        <Link href={ASSETS_CATS_HREF} className="hq-back">← 虛擬體驗元件管理</Link>
        <h1 className="hq-h1">3D 貓咪體型預覽</h1>
      </div>
      <HqTabs tabs={[...BASE_TABS]} value={body}
        onChange={v => router.replace(`${pathname}?body=${v}`, { scroll: false })} />
      {/* key：換分頁時重建預覽與參數，避免沿用上一個體型的動作、眼睛設定 */}
      <BaseLab key={body} body={body} />
    </>
  );
}
