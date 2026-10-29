import type { Metadata } from "next";
import { SiteFooter, SiteHeader, TabBar } from "@/components/Chrome";
import { Town } from "@/components/community/Town";

export const metadata: Metadata = { title: "喵戶小區｜Meowho喵戶", description: "每間房子，都是一個貓戶。逛逛小區，認識住在裡面的貓咪與貓戶。" };

export default function CommunityPage() {
  return (
    <>
      <SiteHeader />
      <main className="wrap"><Town /></main>
      <SiteFooter />
      <TabBar />
    </>
  );
}
