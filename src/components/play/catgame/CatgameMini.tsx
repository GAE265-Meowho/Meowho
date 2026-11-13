"use client";
// 虛擬飼養 DEMO（#237）：把 catgame 原版的小遊戲（vanilla JS，見 minis.ts）包成 client component。
// 原版的小遊戲是蓋在畫面上的對話框（.scrim／.modal），這裡照樣以固定定位疊在 3D 畫面與劇情上面。
import dynamic from "next/dynamic";
import { Mini3DModal } from "../mini3d/Mini3DModal";
import { useEffect, useRef } from "react";
import { feedPortion } from "@/lib/play/mini3d/feed-rules";
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

type Props = { id: MiniId; ctx: MiniCtx; catName: string; onDone: (r: unknown) => void };
const loading = () => <p role="status">3D 遊戲載入中…</p>;
const BrushGameRealistic = dynamic(() => import("../mini3d/BrushGameRealistic").then(m => m.BrushGameRealistic), { ssr: false, loading: () => <p role="status">刷牙遊戲載入中…</p> });
const PetGame3D = dynamic(() => import("../mini3d/PetGame3D").then(m => m.PetGame3D), { ssr: false, loading });
// 換水：第一視角開水龍頭
// 鏟屎：第一視角拖曳貓砂鏟
const ScoopGame3D = dynamic(() => import("../mini3d/ScoopGame3D").then(m => m.ScoopGame3D), { ssr: false, loading });
// 餵貓：第一視角倒乾飼料、開主食罐和湯罐
const FeedGame3D = dynamic(() => import("../mini3d/FeedGame3D").then(m => m.FeedGame3D), { ssr: false, loading });
// 剪指甲：2D 貓掌特寫，雙手操作
const NailGame2D = dynamic(() => import("../mini3d/NailGame2D").then(m => m.NailGame2D), { ssr: false, loading: () => <p role="status">剪指甲遊戲載入中…</p> });
const WaterRefillGame3D = dynamic(() => import("../mini3d/WaterRefillGame3D").then(m => m.WaterRefillGame3D), { ssr: false, loading });

export function CatgameMini(props: Props) {
  const { id, ctx, catName, onDone } = props;
  // 已改成彈窗 3D 特寫的小遊戲；其他照舊用原版 2D（LegacyMini）
  if (id === "brush" || id === "pet") {
    return <Mini3DModal title={id === "brush" ? "幫" + catName + "刷牙" : "摸摸" + catName} onCancel={() => onDone(null)}>
      {id === "brush" ? <BrushGameRealistic ctx={ctx} onDone={onDone} /> : <PetGame3D ctx={ctx} onDone={onDone} />}
    </Mini3DModal>;
  }
  if (id === "water") {
    return <Mini3DModal title={"幫" + catName + "換水"} onCancel={() => onDone(null)}>
      <WaterRefillGame3D onDone={onDone} />
    </Mini3DModal>;
  }
  if (id === "scoop") {
    // shortcut: 貓砂盆一律用開放式；採買選的款式（PlayGame 的 box）還沒帶進 MiniCtx，帶得到時傳給 box
    return <Mini3DModal title={"幫" + catName + "鏟屎"} onCancel={() => onDone(null)}>
      <ScoopGame3D onDone={onDone} />
    </Mini3DModal>;
  }
  if (id === "feed") {
    return <Mini3DModal title={"餵" + catName + "吃飯"} onCancel={() => onDone(null)}>
      <FeedGame3D portion={feedPortion(ctx)} onDone={onDone} />
    </Mini3DModal>;
  }
  if (id === "nail") {
    return <Mini3DModal title={"幫" + catName + "剪指甲"} onCancel={() => onDone(null)}>
      <NailGame2D ctx={ctx} onDone={onDone} />
    </Mini3DModal>;
  }
  return <LegacyMini {...props} />;
}

function LegacyMini({ id, ctx, catName, onDone }: Props) {
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
