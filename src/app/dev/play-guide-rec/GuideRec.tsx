"use client";
// 小遊戲示範影片的錄影頁（#354，只在開發模式）：直接跑真正的小遊戲元件，scripts/play-guide-rec/ 的腳本操作並錄影。
// ?g=<小遊戲>；加 &guide=1 會先顯示示範彈窗（看示範長怎樣）。橘色圓點是錄影裡看得到的滑鼠位置。
import { useEffect, useState } from "react";
import { CatgameMini } from "@/components/play/catgame/CatgameMini";
import type { MiniId } from "@/components/play/catgame/minis";
import { guideKey } from "@/lib/play/mini-guide";
import s from "@/components/play/play.module.css";

export function GuideRec() {
  const [g, setG] = useState<MiniId | null>(null);
  const [pos, setPos] = useState({ x: -50, y: -50, down: false });
  useEffect(() => {
    if (!new URLSearchParams(location.search).get("guide")) for (const id of ["feed", "water", "scoop", "pet", "brush", "nail", "carrier", "play"]) localStorage.setItem(guideKey(id as never), "1");
    setG(new URLSearchParams(location.search).get("g") as MiniId);
    const mv = (e: PointerEvent) => setPos(p => ({ ...p, x: e.clientX, y: e.clientY }));
    const dn = () => setPos(p => ({ ...p, down: true })), up = () => setPos(p => ({ ...p, down: false }));
    addEventListener("pointermove", mv, true); addEventListener("pointerdown", dn, true); addEventListener("pointerup", up, true);
  }, []);
  const ctx = { age: 4, touchFav: "chin" as const, brushLevel: 0, cat: { body: 5, trust: 70, stress: 20, tabby: true } };
  return <div className={s.page} style={{ minHeight: "100vh" }}>
    {g && <CatgameMini id={g} ctx={ctx} catName="灰寶" onDone={r => { (window as unknown as { __done: unknown }).__done = r ?? "null"; }} feedKinds={["dry", "wet", "soup"]} />}
    <div style={{ position: "fixed", left: pos.x, top: pos.y, width: 34, height: 34, marginLeft: -17, marginTop: -17, borderRadius: "50%", border: "3px solid #fff", background: pos.down ? "rgba(232,120,40,.85)" : "rgba(232,120,40,.45)", boxShadow: "0 0 0 2px rgba(0,0,0,.35)", transform: pos.down ? "scale(.8)" : "none", transition: "transform .1s", pointerEvents: "none", zIndex: 2147483647 }} />
  </div>;
}
