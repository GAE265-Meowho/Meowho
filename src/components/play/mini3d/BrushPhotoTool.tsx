"use client";

export function BrushPhotoTool({ phase }: { phase: string }) {
  if (phase === "brush") return <>
    <path d="M6 5Q38 8 55 25L117 53Q133 63 124 73Q117 80 106 73L44 37Q31 23 5 17Z" fill="var(--mint-dk)" />
    <path d="M-14 -2Q-14 -8 -5 -8H13Q21 -8 21 2V8Q21 14 13 14H-6Q-14 14 -14 7Z" fill="var(--paper)" stroke="var(--cocoa)" strokeWidth="2" />
    <path d="M-9 3l-5 -10m10 10l-5 -10m10 10l-5 -10m10 10l-5 -10m10 10l-5 -10" stroke="var(--mint-dk)" strokeWidth="2.5" strokeLinecap="round" />
  </>;
  return <>
    <path d="M0 -12Q-13 -12 -14 1Q-14 10 -3 16L40 42Q53 49 62 35Q67 24 56 16L13 -9Q6 -13 0 -12Z" fill="var(--paper)" stroke="var(--cocoa)" strokeWidth="2" />
    {phase === "finger" && <>
      <path d="M-15 0Q-15 -15 1 -15Q13 -14 27 -3L15 22L-4 15Q-15 10 -15 0Z" fill="var(--mint-dk)" />
      <path d="M-8 -4l13 6m-15 -1l13 6m-14 -1l13 6" stroke="var(--paper)" strokeWidth="2" strokeLinecap="round" />
    </>}
    {phase === "paste" && <path d="M-12 0Q-15 -9 -7 -10Q-3 -18 2 -10Q12 -7 7 0Z" fill="var(--mint-dk)" stroke="var(--paper)" strokeWidth="2" />}
  </>;
}
