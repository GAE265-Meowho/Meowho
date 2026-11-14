"use client";

import { useState } from "react";
import { CatgameMini } from "@/components/play/catgame/CatgameMini";

export function PetOrbitDemo() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  return <main>
    <h1>摸貓視角試玩</h1>
    <button type="button" className="btn" onClick={() => { setResult(null); setOpen(true); }}>開始摸貓</button>
    {result != null && <output>{JSON.stringify(result)}</output>}
    {open && <CatgameMini id="pet" catName="麻糬" ctx={{ age: 24, cat: { body: 75, trust: 65, stress: 20 }, touchFav: "head" }}
      onDone={value => { setResult(value); setOpen(false); }} />}
  </main>;
}
