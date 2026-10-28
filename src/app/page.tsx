import { SiteFooter, SiteHeader, TabBar } from "@/components/Chrome";
import { Hero } from "@/components/Hero";
import { Adopt, Consult, Feed, Stats, Steps, TrialBoard, WelcomeHousehold } from "@/components/Sections";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="top">
        <Hero />
        <Stats />
        <WelcomeHousehold />
        <Adopt />
        <Steps />
        <TrialBoard />
        <Feed />
        <Consult />
      </main>
      <SiteFooter />
      <TabBar />
    </>
  );
}
