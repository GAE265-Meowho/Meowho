import { SiteFooter, SiteHeader, TabBar } from "@/components/Chrome";
import { Hero, Intent } from "@/components/Hero";
import { Adopt, Consult, Feed, Stats, Steps, TrialBoard } from "@/components/Sections";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="top">
        <Intent />
        <Hero />
        <Stats />
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
