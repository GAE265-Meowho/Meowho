import type { IconName } from "@/components/ui/Icon";

// Names follow MeowWho_專題規劃_1030.pptx (slide 13 module groups).
export const mainNav = [
  { label: "帶我回家", href: "/#adopt" },
  // 喵戶小區（/community）頁面先保留，2026-11-09 起本站先不連過去
  { label: "領養三步驟", href: "/#steps" },
  { label: "7 天虛擬飼養", href: "/#trial" },
  // 專屬檔案（原「時光小屋」動態牆）延後，首頁區塊先隱藏，所以導覽不放（#354）
  // 貓咪諮詢站這個階段先不做，首頁區塊隱藏，導覽也不放（#354，2026-11-13）
];

export const tabNav: { label: string; href: string; icon: IconName }[] = [
  { label: "首頁", href: "/", icon: "cat" },
  { label: "帶我回家", href: "/#adopt", icon: "search" },
  { label: "建立喵戶", href: "/onboarding", icon: "plus" },
  // 第四格原本是「時光小屋」、後來是「貓咪諮詢」，都先不做；底部要維持 5 格，「建立喵戶」才會在正中間（#354）
  { label: "領養步驟", href: "/#steps", icon: "key" },
  { label: "我的喵戶", href: "/me", icon: "house" },
];
