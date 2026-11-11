import type { IconName } from "@/components/ui/Icon";

// Names follow MeowWho_專題規劃_1030.pptx (slide 13 module groups).
export const mainNav = [
  { label: "帶我回家", href: "/#adopt" },
  // 喵戶小區（/community）頁面先保留，2026-11-09 起本站先不連過去
  { label: "領養三步驟", href: "/#steps" },
  { label: "7 天虛擬飼養", href: "/#trial" },
  // 「時光小屋」（/#feed）2026-11-11 起首頁隱藏、改名「專屬檔案」，動態牆延後（#354）
  { label: "貓咪諮詢站", href: "/#consult" },
];

export const tabNav: { label: string; href: string; icon: IconName }[] = [
  { label: "首頁", href: "/", icon: "cat" },
  { label: "帶我回家", href: "/#adopt", icon: "search" },
  { label: "建立喵戶", href: "/onboarding", icon: "plus" },
  { label: "諮詢站", href: "/#consult", icon: "comment" },
  { label: "我的喵戶", href: "/me", icon: "house" },
];
