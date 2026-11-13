"use client";
// 虛擬飼養 DEMO（#237）：3D 舞台。兩種房間共用同一個外框，小遊戲（children）疊在上面。
//   A. 3D 掃描房間：後台的 RoomViewer（Gaussian splat），貓與互動由 RoomViewer 自己處理；用品（scanItems）擺在房間地板上；不顯示拍攝點與貓咪動作按鈕。
//   B. 平面圖 3D 娃娃屋：後台的 FloorplanViewer（娃娃屋＋CatActor 走路／跳躍），劇情用 catGoal／catClip／catSpeed 指揮貓，
//      餐碗與貓砂盆用 placedItems 放進去；遠端 GLB 載入失敗時 FloorplanViewer 會畫同尺寸方塊（onItemError 通知）。
// 3D 元件一律 next/dynamic（ssr: false）。
import { CareIcon, type CareIconId } from "./CareIcon";
import dynamic from "next/dynamic";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import type { PlaceAt, PlacedHouseholdItem, RoomClick } from "@/components/hq/assets/FloorplanViewer";
import type { PlayCatLook } from "@/lib/play/cats";
import { DEMO_DOLLHOUSE } from "@/lib/play/room";
import type { SceneItem } from "@/lib/play/scene-items";
import type { RoomWand } from "@/components/hq/assets/RoomViewer";
import type { CatAction } from "@/lib/play/stage";
import type { SceneLight } from "@/lib/play/scene-light";
import type { CameraShot } from "@/lib/play/camera-shot";
import type { Stain } from "@/lib/play/urine-stain";
import type { FarewellPhase } from "@/lib/play/farewell";
import { FarewellScene } from "./FarewellScene";
import v from "./vet.module.css";
import s from "./play.module.css";
import p from "./place.module.css";

const loading = () => <div className={s.stageLoading}>3D 房間載入中…</div>;
const FloorplanViewer = dynamic(() => import("@/components/hq/assets/FloorplanViewer"), { ssr: false, loading });
const RoomViewer = dynamic(() => import("@/components/hq/assets/RoomViewer"), { ssr: false, loading });
const VetRoom = dynamic(() => import("./VetRoom"), { ssr: false });

const ROOMS = [DEMO_DOLLHOUSE];
const noop = () => {};

// 擺用品的四顆方向鍵：x 右 1 左 −1、y 上 1 下 −1（同 lib/hq/rooms/overview.ts 的 OverviewHold）
const PAD = [
  { id: "up", label: "往上轉，更俯視", x: 0, y: 1, key: "ArrowUp", turn: 0 },
  { id: "left", label: "往左轉", x: -1, y: 0, key: "ArrowLeft", turn: -90 },
  { id: "right", label: "往右轉", x: 1, y: 0, key: "ArrowRight", turn: 90 },
  { id: "down", label: "往下轉，更斜", x: 0, y: -1, key: "ArrowDown", turn: 180 },
] as const;
const STILL = { x: 0, y: 0 };

/** 轉動視角的方向鍵：按住連續轉、放開停止；焦點在按鈕上時鍵盤方向鍵也能轉 */
function ViewPad({ onHold }: { onHold: (v: { x: number; y: number }) => void }) {
  const [down, setDown] = useState<string | null>(null);
  const hold = (b: (typeof PAD)[number] | null) => { setDown(b?.id ?? null); onHold(b ? { x: b.x, y: b.y } : STILL); };
  // 手指滑出按鈕、切到別的分頁時不會收到放開事件，一律當作放開
  useEffect(() => {
    const stop = () => { setDown(null); onHold(STILL); };
    addEventListener("blur", stop);
    return () => { removeEventListener("blur", stop); onHold(STILL); };
  }, [onHold]);
  const key = (e: KeyboardEvent, pressed: boolean) => {
    const b = PAD.find(k => k.key === e.key);
    if (!b) return;
    e.preventDefault();  // 不要捲動網頁
    hold(pressed ? b : null);
  };
  return (
    <div className={p.pad} role="group" aria-label="轉動視角" onKeyDown={e => key(e, true)} onKeyUp={e => key(e, false)}>
      {PAD.map(b => (
        <button key={b.id} type="button" className={p.key} data-dir={b.id} data-down={down === b.id ? "true" : undefined} aria-label={b.label}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); hold(b); }}
          onPointerUp={() => hold(null)} onPointerCancel={() => hold(null)} onLostPointerCapture={() => hold(null)}
          onBlur={() => hold(null)} onContextMenu={e => e.preventDefault()}
          onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); hold(b); } }}
          onKeyUp={e => { if (e.key === " " || e.key === "Enter") hold(null); }}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ transform: `rotate(${b.turn}deg)` }}>
            <path d="M12 5l7 9h-4.5v5h-5v-5H5z" fill="currentColor" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function PlayStage({ kind, scanBase, placeView = false, look, tag, bubble, bubbleInset, lookKey, placed, scanItems, story, wand, goal, clip, speed, light, vet = false, shot = null, stains = null, farewell = null, onDrop, onItemError, children }: {
  kind: "scan" | "dollhouse";
  scanBase: string | null;
  /** 擺用品：掃描房間改成俯視鏡頭，畫面上多四顆轉動視角的方向鍵（娃娃屋不變） */
  placeView?: boolean;
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
  /** 白天／夜晚光（lib/play/scene-light.ts 的 lightFor）；兩種房間吃同一組 */
  light?: SceneLight | null;
  /** 看獸醫：診間疊在房間上面（房間不卸載，換回來不重新載入）；lib/play/vet-room.ts 的 showVet */
  vet?: boolean;
  /** 劇情鏡頭（lib/play/camera-shot.ts 的 shotFor）；null＝原本的鏡頭 */
  shot?: CameraShot | null;
  /** 尿漬（lib/play/urine-stain.ts 的 stainsFor）；空／null＝沒有 */
  stains?: readonly Stain[] | null;
  /** 結局插圖那一幕（lib/play/farewell.ts 的 farewellPhase）；null＝不顯示 */
  farewell?: FarewellPhase | null;
  onDrop?: (itemId: string, at: PlaceAt) => void;
  onItemError?: (key: string) => void;
  children?: ReactNode;
}) {
  const [hold, setHold] = useState(STILL);
  const scan = kind === "scan" && Boolean(scanBase);
  const overview = scan && placeView;
  // 診間第一次出現才載入，之後留著（淡出時還看得到；不在畫面時 VetRoom 自己停掉繪製）
  const [vetUsed, setVetUsed] = useState(vet);
  useEffect(() => { if (vet) setVetUsed(true); }, [vet]);
  return (
    <section className={overview ? `${s.stage} ${p.stage}` : s.stage} aria-label="3D 房間">
      {tag && <span className={s.stageTag}>{tag}</span>}
      {kind === "scan" && scanBase
        ? <RoomViewer base={scanBase} items={scanItems} controls={false} story={story} wand={wand} bubble={bubble ? <CareIcon id={bubble} /> : null} bubbleInset={bubbleInset} lookKey={lookKey} overview={overview ? hold : null} light={light?.scan ?? null} shot={shot} stains={stains} />
        : (
          <FloorplanViewer rooms={ROOMS} selected={ROOMS[0].id} onPick={noop}
            cat={look} placedItems={placed} interactMode="point"
            catGoal={goal} catClip={clip} catSpeed={speed} light={light?.house ?? null} shot={shot} stains={stains}
            onFloorDrop={onDrop} onItemError={onItemError} />
        )}
      {vetUsed && (
        <div className={v.vet} data-on={vet ? "true" : "false"} aria-label={vet ? "動物醫院診間" : undefined} role={vet ? "img" : undefined}>
          <VetRoom look={look} light={light?.house ?? null} active={vet} />
        </div>
      )}
      {farewell && <FarewellScene phase={farewell} />}
      {kind !== "scan" && bubble && <span className={s.bubbleFixed} aria-hidden="true"><CareIcon id={bubble} /></span>}
      {overview && <ViewPad onHold={setHold} />}
      {children}
    </section>
  );
}
