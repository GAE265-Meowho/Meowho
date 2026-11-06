"use client";
// 虛擬飼養 DEMO（#237）：把 catgame 原版的小遊戲（vanilla JS，見 minis.ts）包成 client component。
// 原版的小遊戲是蓋在畫面上的對話框（.scrim／.modal），這裡照樣以固定定位疊在 3D 畫面與劇情上面。
import { useEffect, useRef } from "react";
import { startMini, type MiniCtx, type MiniId } from "./minis";
import s from "./catgame.module.css";

export function CatgameMini({ id, ctx, onDone }: { id: MiniId; ctx: MiniCtx; onDone: (r: unknown) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  const start = useRef(ctx);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    if (!root.current) return;
    return startMini(id, root.current, start.current, r => done.current(r));
  }, [id]);
  return <div ref={root} className={s.cg} />;
}
