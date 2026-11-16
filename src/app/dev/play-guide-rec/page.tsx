import { notFound } from "next/navigation";
import { GuideRec } from "./GuideRec";

export default function PlayGuideRecPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <GuideRec />;
}
