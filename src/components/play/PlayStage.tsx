"use client";
// 虛擬飼養 DEMO（#237）：3D 舞台。兩種房間共用同一個外框，小遊戲（children）疊在上面。
//   A. 3D 掃描房間：後台的 RoomViewer（Gaussian splat），貓與互動由 RoomViewer 自己處理；用品（scanItems）擺在房間地板上；不顯示拍攝點與貓咪動作按鈕。
//   B. 平面圖 3D 娃娃屋：後台的 FloorplanViewer（娃娃屋＋CatActor 走路／跳躍），劇情用 catGoal／catClip／catSpeed 指揮貓，
//      餐碗與貓砂盆用 placedItems 放進去；遠端 GLB 載入失敗時 FloorplanViewer 會畫同尺寸方塊（onItemError 通知）。
// 3D 元件一律 next/dynamic（ssr: false）。
import { CareIcon, type CareIconId } from "./CareIcon";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sideFromKey, type OverviewSide } from "@/lib/hq/rooms/overview";
import type { PlaceAt, PlacedHouseholdItem, RoomClick } from "@/components/hq/assets/FloorplanViewer";
import type { PlayCatLook } from "@/lib/play/cats";
import { DEMO_DOLLHOUSE } from "@/lib/play/room";
import type { SceneItem } from "@/lib/play/scene-items";
import type { RoomPlaceEdit, RoomWand } from "@/components/hq/assets/RoomViewer";
import type { CatAction } from "@/lib/play/stage";
import s from "./play.module.css";
import f from "./PlayFollow.module.css";
import p from "./place.module.css";

const loading = () => <div className={s.stageLoading}>3D 房間載入中…</div>;
const FloorplanViewer = dynamic(() => import("@/components/hq/assets/FloorplanViewer"), { ssr: false, loading });
const RoomViewer = dynamic(() => import("@/components/hq/assets/RoomViewer"), { ssr: false, loading });

const ROOMS = [DEMO_DOLLHOUSE];
const noop = () => {};

// 擺用品的四顆視角鈕：切換到從房間哪一側往裡看（像看平面圖：門口＝前側在下方，所以上＝後側）
const PAD = [
  { id: "up", side: "back", label: "從房間後側看", key: "ArrowUp", turn: 0 },
  { id: "left", side: "left", label: "從房間左側看", key: "ArrowLeft", turn: -90 },
  { id: "right", side: "right", label: "從房間右側看", key: "ArrowRight", turn: 90 },
  { id: "down", side: "front", label: "從房間前側（門口）看", key: "ArrowDown", turn: 180 },
] as const satisfies readonly { id: string; side: OverviewSide; label: string; key: string; turn: number }[];

/** 切換俯視視點的四顆鈕；目前那一側亮起（aria-pressed） */
function ViewPad({ side, onSide }: { side: OverviewSide; onSide: (s: OverviewSide) => void }) {
  return (
    <div className={p.pad} role="group" aria-label="切換視角">
      {PAD.map(b => (
        <button key={b.id} type="button" className={p.key} data-dir={b.id} aria-pressed={side === b.side} aria-label={b.label} title={b.label}
          onClick={() => onSide(b.side)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ transform: `rotate(${b.turn}deg)` }}>
            <path d="M12 5l7 9h-4.5v5h-5v-5H5z" fill="currentColor" />
          </svg>
        </button>
      ))}
    </div>
  );
}

/** 量擺用品卡片（劇情卡底板 .sheet 的最後一張）蓋住舞台下方的比例；卡片大小、視窗大小一變就重量 */
function useBottomCover(stage: React.RefObject<HTMLElement | null>, on: boolean) {
  const [cover, setCover] = useState(0);
  useEffect(() => {
    const el = stage.current;
    if (!on || !el) { setCover(0); return; }
    const sheet = el.parentElement?.querySelector<HTMLElement>(`.${CSS.escape(s.sheet)}`) ?? null;
    const measure = () => {
      const card = sheet?.lastElementChild as HTMLElement | null | undefined;
      const r = el.getBoundingClientRect();
      if (!card || !r.height || card.offsetParent === null) { setCover(0); return; }
      const c = card.getBoundingClientRect();
      // 只算真的疊在舞台上的部分（電腦版卡片在舞台中下方，也算）
      const overlap = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top);
      setCover(overlap > 0 && c.top > r.top ? Math.round((Math.min(r.bottom, c.bottom) - c.top) / r.height * 100) / 100 : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (sheet) { ro.observe(sheet); for (const c of Array.from(sheet.children)) ro.observe(c); }
    const mo = sheet ? new MutationObserver(() => { for (const c of Array.from(sheet.children)) ro.observe(c); measure(); }) : null;
    mo?.observe(sheet!, { childList: true, attributes: true });
    addEventListener("resize", measure);
    return () => { ro.disconnect(); mo?.disconnect(); removeEventListener("resize", measure); };
  }, [stage, on]);
  return cover;
}

export function PlayStage({ kind, scanBase, placeView = false, place = null, look, tag, bubble, bubbleInset, lookKey, placed, scanItems, story, wand, goal, clip, speed, onDrop, onItemError, children }: {
  kind: "scan" | "dollhouse";
  scanBase: string | null;
  /** 擺用品：掃描房間改成從某一側俯視整個房間，畫面上多四顆切換視角的鈕（娃娃屋不變） */
  placeView?: boolean;
  /** 擺用品：在掃描房間裡點地板放用品、拖曳用品、移動鈕（見 RoomViewer 的 place） */
  place?: RoomPlaceEdit | null;
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
  // 第 1 天（劇情叫貓躲外出籠）：娃娃屋的貓整隻縮在擺好的外出籠裡
  const carrier = story?.action === "carrier" ? placed.find(p => p.key.startsWith("carrier:")) : undefined;
  const tuck = useMemo(() => (carrier
    ? { x: carrier.x, y: carrier.y, z: carrier.z, widthM: carrier.widthM, depthM: carrier.depthM, heightM: carrier.heightM, rotY: ((carrier.rotY ?? 0) * Math.PI) / 180 }
    : null), [carrier]);
  // 跟著貓：飼養中（有劇情動作）才有按鈕；娃娃屋原本就一直跟，預設開；掃描房間預設關
  const [follow, setFollow] = useState(kind === "dollhouse");
  useEffect(() => { setFollow(kind === "dollhouse"); }, [kind]);
  const followOff = useCallback(() => setFollow(false), []);
  const [side, setSide] = useState<OverviewSide>("front");
  const scan = kind === "scan" && Boolean(scanBase);
  const overview = scan && placeView;
  const stageEl = useRef<HTMLElement>(null);
  const cover = useBottomCover(stageEl, overview);
  // 鍵盤方向鍵切換視角（焦點在輸入框時不攔）
  useEffect(() => {
    if (!overview) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      const next = sideFromKey(e.code);
      if (!next) return;
      e.preventDefault();
      setSide(next);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [overview]);
  return (
    <section ref={stageEl} className={overview ? `${s.stage} ${p.stage}` : s.stage} aria-label="3D 房間">
      {tag && <span className={s.stageTag}>{tag}</span>}
      {kind === "scan" && scanBase
        ? <RoomViewer base={scanBase} items={scanItems} controls={false} story={story} wand={wand} bubble={bubble ? <CareIcon id={bubble} /> : null} bubbleInset={bubbleInset} lookKey={lookKey} follow={follow} onFollowOff={followOff} overview={overview ? side : null} overviewCover={cover} place={overview ? place : null} />
        : (
          <FloorplanViewer rooms={ROOMS} selected={ROOMS[0].id} onPick={noop}
            cat={look} placedItems={placed} interactMode="point"
            catGoal={goal} catClip={clip} catSpeed={speed} catTuck={tuck} catFollow={follow} onCatFollowOff={followOff}
            onFloorDrop={onDrop} onItemError={onItemError} />
        )}
      {kind !== "scan" && bubble && <span className={s.bubbleFixed} aria-hidden="true"><CareIcon id={bubble} /></span>}
      {story && look && (
        <button type="button" className={f.follow} aria-pressed={follow} onClick={() => setFollow(v => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="8" />
          </svg>
          跟著貓
        </button>
      )}
      {overview && <ViewPad side={side} onSide={setSide} />}
      {children}
    </section>
  );
}
