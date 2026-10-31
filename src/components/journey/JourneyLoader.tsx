"use client";

import dynamic from "next/dynamic";

// WebGL only exists in the browser, so the journey never renders on the server.
const CatJourney = dynamic(() => import("./CatJourney"), { ssr: false });

export default function JourneyLoader() {
  return <CatJourney />;
}
