"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { brushDifficulty, brushPointers, brushScore, brushStep, brushStruggling, newBrush, type BrushResult } from "@/lib/play/mini3d/brush-rules";
import { inPhotoZone, lipZone, noseZone, photoMouth, photoPoint, photoStroke, photoTarget, toothZones, type PhotoPoint } from "@/lib/play/mini3d/brush-photo-regions";
import type { MiniCtx } from "../catgame/minis";
import styles from "./mini3d.module.css";
import photo from "./brush-photo.module.css";

const instructions = {
  touch: ["碰嘴角", "按住嘴角標記。"],
  lift: ["翻開嘴角", "按住嘴角標記向上拖，保持露牙。"],
  paste: ["嚐嚐牙膏", "把指套移到鼻子標記並停住。"],
  finger: ["指套刷牙", "一指向上拖開嘴角，另一指沿著標記來回刷。"],
  brush: ["牙刷刷牙", "一指向上拖開嘴角，另一指用牙刷沿著標記來回刷。"],
} as const;

function newInput() {
  return {
    pointers: { lip: null, tool: null } as Parameters<typeof brushPointers>[0],
    startY: 0,
    lift: 0,
    key: false,
    keyLift: 0,
    locked: false,
    tool: null as PhotoPoint | null,
    angle: 25,
    travel: 0,
  };
}

export function BrushGameRealistic({ ctx, onDone }: { ctx: MiniCtx; onDone: (result: BrushResult) => void }) {
  const [config] = useState(() => brushDifficulty(ctx.cat.trust, ctx.cat.stress, ctx.brushLevel ?? 0));
  const [state, setState] = useState(() => newBrush(config));
  const [frame, setFrame] = useState<ReturnType<typeof photoMouth>>("closed");
  const [activeTooth, setActiveTooth] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState(false);
  const scene = useRef<HTMLDivElement>(null);
  const toolGraphic = useRef<SVGGElement>(null);
  const lipGraphic = useRef<SVGCircleElement>(null);
  const input = useRef(newInput());
  const started = useRef(false);
  const ready = loaded.size === 3 && !failed;
  const paste = config.phase === "paste";
  const touch = config.phase === "touch";
  const score = brushScore(state);
  const struggle = brushStruggling(state.elapsed, config);
  const [title, hint] = instructions[config.phase];

  useEffect(() => {
    if (!ready) return;
    let game = newBrush(config);
    let previous: number | null = null;
    let displayElapsed = 0;
    let visualLift = 0;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let animation: number;
    const reset = () => {
      const node = scene.current;
      const { lip, tool } = input.current.pointers;
      input.current = newInput();
      for (const id of [lip, tool]) {
        if (id !== null && node?.hasPointerCapture(id)) node.releasePointerCapture(id);
      }
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || paste || !scene.current?.closest("dialog")?.contains(document.activeElement) ||
        (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select, a"))) return;
      event.preventDefault();
      input.current.key = true;
      input.current.keyLift = 0;
      if (input.current.pointers.tool === null) input.current.tool = null;
      started.current = true;
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      input.current.key = false;
      input.current.travel = 0;
      if (input.current.pointers.lip === null) input.current.locked = false;
    };
    const tick = (time: number) => {
      const dt = Math.min(.1, (time - (previous ?? time)) / 1000);
      previous = time;
      const current = input.current;
      if (current.key) current.keyLift = motion?.matches ? .04 : Math.min(.04, current.keyLift + dt * .25);
      const distance = current.key ? current.keyLift : current.lift;
      const rawHold = touch ? current.key || current.pointers.lip !== null : distance >= .04;
      const wasStruggling = brushStruggling(game.elapsed, config);
      const holding = rawHold && (!current.locked || wasStruggling);
      if (started.current) {
        const target = holding && !wasStruggling && current.tool ? photoTarget(current.tool, config.teeth) : null;
        game = brushStep(game, config, {
          dt,
          holding,
          target,
          travel: current.travel,
          near: paste ? !!current.tool && inPhotoZone(current.tool, noseZone) : true,
        });
      }
      const struggling = brushStruggling(game.elapsed, config);
      if (struggling && (current.key || current.pointers.lip !== null)) current.locked = true;
      const blocked = touch || paste || current.locked || struggling || !!game.result;
      const mouth = photoMouth(distance, blocked);
      const desiredLift = blocked ? 0 : Math.min(.04, distance);
      const controllingLip = current.key || current.pointers.lip !== null;
      visualLift = (controllingLip && !blocked) || motion?.matches
        ? desiredLift
        : Math.max(desiredLift, visualLift - dt * .35);
      const node = scene.current;
      // Fade only between adjacent frames. The closed portrait remains the base.
      node?.style.setProperty("--lift-opacity", String(Math.min(1, visualLift / .018)));
      node?.style.setProperty("--teeth-opacity", String(Math.max(0, (visualLift - .018) / .022)));
      const toolVisible = !game.result && !struggling && (paste || mouth === "teeth") && current.tool;
      toolGraphic.current?.setAttribute("visibility", toolVisible ? "visible" : "hidden");
      if (toolVisible) {
        toolGraphic.current?.setAttribute("transform",
          `translate(${toolVisible.x * 1086} ${toolVisible.y * 1448}) rotate(${current.angle})`);
      }
      lipGraphic.current?.setAttribute("cy", String((paste ? noseZone.y : lipZone.y - visualLift) * 1448));
      setActiveTooth(toolVisible && !paste && current.travel > 0 ? photoTarget(toolVisible, config.teeth) : null);
      current.travel = 0;
      setFrame(mouth);
      displayElapsed += dt;
      if (displayElapsed >= .08 || wasStruggling !== struggling || game.result) {
        displayElapsed = 0;
        setState(game);
      }
      if (!game.result) animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", reset);
    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", reset);
      reset();
    };
  }, [config, paste, ready, touch]);

  function point(event: PointerEvent<HTMLDivElement>) {
    return photoPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  }

  function down(event: PointerEvent<HTMLDivElement>) {
    if (!ready || state.result || event.button !== 0) return;
    const current = input.current;
    const position = point(event);
    const lip = !paste && !current.key && current.pointers.lip === null && inPhotoZone(position, lipZone);
    if (!lip && (touch || config.phase === "lift")) return;
    const role = lip ? "lip" : "tool";
    const next = brushPointers(current.pointers, event.pointerId, role);
    if (next === current.pointers) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    current.pointers = next;
    started.current = true;
    if (lip) current.startY = position.y;
    else current.tool = position;
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const current = input.current;
    if (event.pointerType === "mouse") {
      event.currentTarget.dataset.lipHover = String(ready && !paste && !state.result
        && !current.key && current.pointers.lip === null && inPhotoZone(point(event), lipZone));
    }
    if (current.pointers.lip === event.pointerId) {
      current.lift = Math.max(0, current.startY - point(event).y);
      if (current.lift < .04) current.travel = 0;
    }
    const keyboardMouse = current.key && event.pointerType === "mouse" && current.pointers.tool === null;
    if (current.pointers.tool !== event.pointerId && !keyboardMouse) return;
    const position = point(event);
    if (current.tool) {
      const dx = position.x - current.tool.x;
      const dy = position.y - current.tool.y;
      if (Math.hypot(dx, dy) > .001) {
        current.angle = 25 + Math.max(-12, Math.min(12, dy * Math.sign(dx || 1) * 900));
      }
      if (paste) current.travel += Math.hypot(position.x - current.tool.x, position.y - current.tool.y) * 2.4;
      else if (!current.locked && (current.key ? current.keyLift >= .04 : current.lift >= .04)) {
        const target = photoTarget(position, config.teeth);
        if (target !== photoTarget(current.tool, config.teeth)) current.travel = 0;
        current.travel += photoStroke(current.tool, position, config.teeth);
      }
    }
    current.tool = position;
  }

  function leave(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.dataset.lipHover = "false";
    if (input.current.pointers.tool !== null) return;
    input.current.tool = null;
    input.current.travel = 0;
  }

  function release(event: PointerEvent<HTMLDivElement>) {
    const current = input.current;
    if (current.pointers.lip === event.pointerId) {
      current.lift = 0;
      current.travel = 0;
      if (!current.key) current.locked = false;
    }
    if (current.pointers.tool === event.pointerId) {
      current.tool = null;
      current.travel = 0;
    }
    current.pointers = brushPointers(current.pointers, event.pointerId, "release");
  }

  const marker = paste ? noseZone : lipZone;
  const status = state.result?.bitten ? "貓咪咬人了" : state.result?.ran ? "貓咪跑走了"
    : state.result ? "練習完成" : struggle ? "貓咪想休息，請放開嘴角"
    : frame === "teeth" && config.teeth > 0 ? "保持翻唇，用刷頭輕刷露出的牙齒。" : "";
  return <>
    <p className={styles.hint} id="brush-photo-hint"><strong>{title}：</strong>{hint}
      {!paste && " 桌面可按住空白鍵，移動滑鼠操作。"}
    </p>
    <div ref={scene} className={photo.stage} data-mouth={frame} role="group" aria-label="刷牙練習影像"
      aria-describedby="brush-photo-hint" tabIndex={0}
      onPointerDown={down} onPointerMove={move} onPointerLeave={leave}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      {(["closed", "lift", "teeth"] as const).map(name => (
        <Image key={name} src={"/play/brush/brush-" + name + ".webp"} alt={name === "closed" ? "AI 合成虎斑貓練習影像" : ""}
          fill unoptimized loading="eager" draggable={false}
          fetchPriority={name === "closed" ? "high" : "low"}
          onLoad={() => setLoaded(images => images.has(name) ? images : new Set(images).add(name))}
          onError={() => setFailed(true)}
          className={name === "closed" ? undefined : photo.mouth} data-photo-frame={name} />
      ))}
      {ready && !state.result && <svg className={photo.overlay} viewBox="0 0 1086 1448" aria-hidden="true">
        {frame !== "teeth" && <circle ref={lipGraphic} className={photo.marker} cx={marker.x * 1086} cy={marker.y * 1448} r="23" />}
        {frame === "teeth" && toothZones(config.teeth).map((zone, index) => (
          <circle key={index} className={photo.tooth} data-active={index === activeTooth || state.clean[index] === 1}
            cx={zone.x * 1086} cy={zone.y * 1448} r={index === activeTooth ? 11 : 6} />
        ))}
        <g ref={toolGraphic} visibility="hidden">
          <path d={config.phase === "brush" ? "M8 0H37Q58 0 74 7H144" : "M8 0H42"} className={photo.handle} />
          <rect x="-14" y="-8" width="28" height="16" rx="6" className={photo.tip} />
          {config.phase === "brush" && <path d="M-8 -5V5M-3 -5V5M2 -5V5M7 -5V5" className={photo.bristles} />}
        </g>
      </svg>}
    </div>
    {failed ? <p role="alert">無法載入刷牙影像，請關閉後再試。</p> : !ready && <p role="status">刷牙影像載入中…</p>}
    <div className={styles.meters}>
      <label>進度 <progress max={100} value={score} /> {score}%</label>
      <label>耐心 <progress max={config.patience} value={Math.max(0, config.patience - state.elapsed)} /></label>
    </div>
    <p className={styles.status} role="status">{status}</p>
    {state.result && <button className="btn" type="button" onClick={() => state.result && onDone(state.result)}>確認結果</button>}
    <p>AI 模擬畫面，僅供參考，非醫療建議。</p>
  </>;
}
