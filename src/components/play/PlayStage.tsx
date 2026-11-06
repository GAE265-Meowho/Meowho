"use client";
// 虛擬飼養 DEMO（#237）：3D 舞台。兩種房間共用同一個外框，小遊戲（children）疊在上面。
//   A. 3D 掃描房間：後台的 RoomViewer（Gaussian splat，manifest＝NEXT_PUBLIC_ROOM_DEMO_BASE），貓與互動由 RoomViewer 自己處理。
//   B. 平面圖 3D 娃娃屋：後台的 FloorplanViewer（娃娃屋＋CatActor 走路／跳躍），劇情用 catGoal／catClip／catSpeed 指揮貓，
//      餐碗與貓砂盆用 placedItems 放進去；遠端 GLB 載入失敗時 FloorplanViewer 會畫同尺寸方塊（onItemError 通知）。
// 3D 元件一律 next/dynamic（ssr: false）。
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { PlaceAt, PlacedHouseholdItem, RoomClick } from "@/components/hq/assets/FloorplanViewer";
import type { PlayCatLook } from "@/lib/play/cats";
import { DEMO_DOLLHOUSE } from "@/lib/play/room";
import s from "./play.module.css";

const loading = () => <div className={s.stageLoading}>3D 房間載入中…</div>;
const FloorplanViewer = dynamic(() => import("@/components/hq/assets/FloorplanViewer"), { ssr: false, loading });
const RoomViewer = dynamic(() => import("@/components/hq/assets/RoomViewer"), { ssr: false, loading });

const ROOMS = [DEMO_DOLLHOUSE];
const noop = () => {};

export function PlayStage({ kind, scanBase, look, tag, placed, goal, clip, speed, onDrop, onItemError, children }: {
  kind: "scan" | "dollhouse";
  scanBase: string | null;
  /** null＝貓不在畫面（原版場景的 cat: "none"） */
  look: PlayCatLook | null;
  /** 左上角的小標（例如「到家第一天」） */
  tag?: string;
  placed: PlacedHouseholdItem[];
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
        ? <RoomViewer base={scanBase} />
        : (
          <FloorplanViewer rooms={ROOMS} selected={ROOMS[0].id} onPick={noop}
            cat={look} placedItems={placed} interactMode="point"
            catGoal={goal} catClip={clip} catSpeed={speed}
            onFloorDrop={onDrop} onItemError={onItemError} />
        )}
      {children}
    </section>
  );
}
