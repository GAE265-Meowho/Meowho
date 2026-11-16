"use client";

import { useState } from "react";
import { CatgameMini } from "@/components/play/catgame/CatgameMini";
import { SoundToggle } from "@/components/play/PlayAudio";

export function PetOrbitDemo() {
  const [open, setOpen] = useState<"pet" | "brush" | null>(null);
  const [result, setResult] = useState<unknown>(null);
  return <main>
    <h1>摸貓視角試玩</h1>
    <SoundToggle />
    <button type="button" className="btn" onClick={() => { setResult(null); setOpen("pet"); }}>開始摸貓</button>
    <button type="button" className="btn ghost" onClick={() => { setResult(null); setOpen("brush"); }}>開始刷牙</button>
    {result != null && <output>{JSON.stringify(result)}</output>}
    {open && <CatgameMini id={open} catName="麻糬" ctx={{ age: 24, cat: { body: 75, trust: 65, stress: 20 }, touchFav: "head" }}
      onDone={value => { setResult(value); setOpen(null); }} />}
  </main>;
}
