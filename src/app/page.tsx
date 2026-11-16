import { SiteFooter, SiteHeader, TabBar } from "@/components/Chrome";
import AdoptSection from "@/components/home/adopt/AdoptSection";
import Hero from "@/components/home/hero/Hero";
import Steps from "@/components/home/steps/Steps";
import Trial from "@/components/home/trial/Trial";
import CoreValues from "@/components/home/values/CoreValues";
import JourneyLoader from "@/components/journey/JourneyLoader";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="top">
        <Hero />
        <CoreValues />
        <AdoptSection />
        <Steps />
        <Trial />
        {/* 專屬檔案（動態牆＋週報）延後，先不顯示；元件留在 components/home/feed（#354） */}
        {/* 貓咪諮詢站這個階段先不做，先不顯示；元件留在 components/home/consult（#354，2026-11-13） */}
      </main>
      <SiteFooter />
      <TabBar />
      {/* 橘子 walks down through every section above, ending at the footer's new home */}
      <JourneyLoader />
    </>
  );
}
