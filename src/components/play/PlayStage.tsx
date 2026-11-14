"use client";
// 虛擬飼養 DEMO（#237）：3D 舞台。兩種房間共用同一個外框，小遊戲（children）疊在上面。
//   A. 3D 掃描房間：後台的 RoomViewer（Gaussian splat），貓與互動由 RoomViewer 自己處理；用品（scanItems）擺在房間地板上；不顯示拍攝點與貓咪動作按鈕。
//   B. 平面圖 3D 娃娃屋：後台的 FloorplanViewer（娃娃屋＋CatActor 走路／跳躍），劇情用 catGoal／catClip／catSpeed 指揮貓，
//      餐碗與貓砂盆用 placedItems 放進去；遠端 GLB 載入失敗時 FloorplanViewer 會畫同尺寸方塊（onItemError 通知）。
// 3D 元件一律 next/dynamic（ssr: false）。
import { CareIcon, type CareIconId } from "./CareIcon";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { PlaceAt, PlacedHouseholdItem, RoomClick } from "@/components/hq/assets/FloorplanViewer";
import type { PlayCatLook } from "@/lib/play/cats";
import { DEMO_DOLLHOUSE } from "@/lib/play/room";
import type { SceneItem } from "@/lib/play/scene-items";
import type { RoomWand } from "@/components/hq/assets/RoomViewer";
import type { CatAction } from "@/lib/play/stage";
import s from "./play.module.css";
import { playSfx } from "@/lib/play/audio-player";

const loading = () => <div className={s.stageLoading}>3D 房間載入中…</div>;
const FloorplanViewer = dynamic(() => import("@/components/hq/assets/FloorplanViewer"), { ssr: false, loading });
const RoomViewer = dynamic(() => import("@/components/hq/assets/RoomViewer"), { ssr: false, loading });

const ROOMS = [DEMO_DOLLHOUSE];
/** 貓跳上、跳下家具落地的聲音（音檔還沒上傳時不出聲） */
const landSound = () => playSfx("sfx_land");
const noop = () => {};

export function PlayStage({ kind, scanBase, look, tag, bubble, bubbleInset, lookKey, placed, scanItems, story, wand, goal, clip, speed, onDrop, onItemError, children }: {
  kind: "scan" | "dollhouse";
  scanBase: string | null;
  /** null＝貓不在畫面（原版場景的 cat: "none"） */
  look: PlayCatLook | null;
  /** 左上角的小標（例如「到家第一天」） */
  tag?: string;
  /** 貓頭頂的小對話框（表情符號） */
  bubble?: CareIconId | null;
  /** 畫面下方被劇情卡蓋住的比例 */
  bubbleInset?: number;
  /** 值一變，鏡頭轉向貓 */
  lookKey?: string | null;
  placed: PlacedHouseholdItem[];
  /** 掃描房間裡的用品（外出籠、餐碗、貓砂盆） */
  scanItems?: readonly SceneItem[];
  /** 掃描房間裡貓的劇情動作（null＝貓不在場） */
  story?: { action: CatAction | null; at: number } | null;
  /** 3D 逗貓（掃描房間） */
  wand?: RoomWand | null;
  goal: (RoomClick & { at: number }) | null;
  clip: string | null;
  speed: number;
  onDrop?: (itemId: string, at: PlaceAt) => void;
  onItemError?: (key: string) => void;
  children?: ReactNode;
}) {
  return (
    <section className={s.stage} aria-label="3D 房間">
      {tag && <span className={s.stageTag}>{tag}</span>}
      {kind === "scan" && scanBase
        ? <RoomViewer base={scanBase} items={scanItems} controls={false} story={story} wand={wand} bubble={bubble ? <CareIcon id={bubble} /> : null} bubbleInset={bubbleInset} lookKey={lookKey} />
        : (
          <FloorplanViewer rooms={ROOMS} selected={ROOMS[0].id} onPick={noop}
            cat={look} placedItems={placed} interactMode="point"
            catGoal={goal} catClip={clip} catSpeed={speed}
            onFloorDrop={onDrop} onItemError={onItemError} onCatLand={landSound} />
        )}
      {kind !== "scan" && bubble && <span className={s.bubbleFixed} aria-hidden="true"><CareIcon id={bubble} /></span>}
      {children}
    </section>
  );
}
