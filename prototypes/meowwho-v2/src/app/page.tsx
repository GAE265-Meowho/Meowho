import AdoptSection from "@/components/home/adopt/AdoptSection";
import Consult from "@/components/home/consult/Consult";
import Feed from "@/components/home/feed/Feed";
import Hero from "@/components/home/hero/Hero";
import Steps from "@/components/home/steps/Steps";
import Trial from "@/components/home/trial/Trial";
import CoreValues from "@/components/home/values/CoreValues";
import JourneyLoader from "@/components/journey/JourneyLoader";

export default function Home() {
  return (
    <>
      <Hero />
      <CoreValues />
      <AdoptSection />
      <Steps />
      <Trial />
      <Feed />
      <Consult />
      {/* 橘子 walks down through every section above, ending at the footer's new home */}
      <JourneyLoader />
    </>
  );
}
