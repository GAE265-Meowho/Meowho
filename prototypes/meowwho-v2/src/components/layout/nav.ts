import type { IconName } from "@/components/ui/Icon";

// Names follow MeowWho_專題規劃_1030.pptx (slide 13 module groups).
export const mainNav = [
  { label: "帶我回家", href: "/#adopt" },
  { label: "AR 環境報告", href: "/#steps" },
  { label: "7 天虛擬飼養", href: "/#trial" },
  { label: "時光小屋", href: "/#feed" },
  { label: "貓咪諮詢站", href: "/#consult" },
];

export const tabNav: { label: string; href: string; icon: IconName }[] = [
  { label: "首頁", href: "/", icon: "cat" },
  { label: "帶我回家", href: "/#adopt", icon: "search" },
  { label: "建立喵戶", href: "/onboarding", icon: "plus" },
  { label: "時光小屋", href: "/#feed", icon: "camera" },
  { label: "我的喵戶", href: "/me", icon: "house" },
];
