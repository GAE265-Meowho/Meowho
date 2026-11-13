import type { CareAct } from "@/lib/play/care";

export type CareIconId = CareAct | "heart" | "hiss";

const paths: Record<CareIconId, string> = {
  feed: "M3 12h18l-2 6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zm2 0 2-4 3 1 2-4 3 3 3-1 2 5",
  water: "M12 3c-2 4-6 7-6 11a6 6 0 0 0 12 0c0-4-4-7-6-11Zm-3 11a3 3 0 0 0 3 3",
  scoop: "M5 11h11l-2 8H7l-4-5zm10 1 4-7 2 1-4 7M8 14h4m-3 2h3",
  play: "M16 17a7 7 0 1 0-5 2h6c2 0 4 1 4 3M5 8l10 8m-7-10 10 7M5 14l8-8m-4 12 9-8",
  pet: "M3 14h4l3-4a2 2 0 0 1 3 2l-1 2h7a2 2 0 0 1 1 3l-3 3H8l-2-2H3zm11-7c-4-2 0-6 2-3 2-3 6 1 2 3l-2 2z",
  brush: "M7 3c2 0 3 1 5 1s3-1 5-1c3 0 4 3 3 6l-3 10c-.5 2-2 2-3 0l-1-5c-.4-1-1.6-1-2 0l-1 5c-1 2-2.5 2-3 0L4 9C3 6 4 3 7 3Zm9 4h.01",
  nail: "M9 11 19 3l-3 7-7 6m6-5 4 5-6-2M8 16a3 3 0 1 1-4 4 3 3 0 0 1 4-4Zm10 0a3 3 0 1 1-3 4 3 3 0 0 1 3-4Z",
  heart: "M12 20 4 12C-1 7 6 1 12 7c6-6 13 0 8 5z",
  hiss: "m4 11 3-8 4 4h2l4-4 3 8v5c0 3-4 5-8 5s-8-2-8-5zm3 1 3 1m7-1-3 1m-5 5 3-3 3 3",
};

export function CareIcon({ id }: { id: CareIconId }) {
  return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    <path d={paths[id]} />
  </svg>;
}
