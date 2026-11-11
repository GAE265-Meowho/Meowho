import { SiteFooter, SiteHeader, TabBar } from "@/components/Chrome";
import AdoptSection from "@/components/home/adopt/AdoptSection";
import Consult from "@/components/home/consult/Consult";
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
        {/* 「時光小屋」（Feed.tsx）2026-11-11 起先隱藏，動態牆延後（#354）；要恢復就把 <Feed /> 加回這裡 */}
        <Consult />
      </main>
      <SiteFooter />
      <TabBar />
      {/* 橘子 walks down through every section above, ending at the footer's new home */}
      <JourneyLoader />
    </>
  );
}
