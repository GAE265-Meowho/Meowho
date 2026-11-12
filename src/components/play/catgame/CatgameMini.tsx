"use client";
// 虛擬飼養 DEMO（#237）：把 catgame 原版的小遊戲（vanilla JS，見 minis.ts）包成 client component。
// 原版的小遊戲是蓋在畫面上的對話框（.scrim／.modal），這裡照樣以固定定位疊在 3D 畫面與劇情上面。
import { useEffect, useRef } from "react";
import { startMini, type MiniCtx, type MiniId } from "./minis";
import s from "./catgame.module.css";

/** 小遊戲的文字是原版寫死的「麻糬」；畫出來之後把文字裡的名字換成這隻貓（原版一直在改 DOM，所以用 observer 跟著換） */
const ORIGINAL_NAME = "麻糬";
function renameCat(root: HTMLElement, name: string): () => void {
  if (name === ORIGINAL_NAME) return () => {};
  const walk = () => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = it.nextNode(); n; n = it.nextNode()) if (n.nodeValue?.includes(ORIGINAL_NAME)) n.nodeValue = n.nodeValue.split(ORIGINAL_NAME).join(name);
  };
  walk();
  const ob = new MutationObserver(walk);
  ob.observe(root, { childList: true, characterData: true, subtree: true });
  return () => ob.disconnect();
}

export function CatgameMini({ id, ctx, catName, onDone }: { id: MiniId; ctx: MiniCtx; catName: string; onDone: (r: unknown) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  const start = useRef(ctx);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    if (!root.current) return;
    const stop = startMini(id, root.current, start.current, r => done.current(r));
    const unname = renameCat(root.current, catName);
    return () => { unname(); stop?.(); };
  }, [id, catName]);
  return <div ref={root} className={s.cg} />;
}
