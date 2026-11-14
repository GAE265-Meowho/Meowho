import { notFound } from "next/navigation";
import { PetOrbitDemo } from "./PetOrbitDemo";

export default function PetOrbitPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PetOrbitDemo />;
}
