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
    locked: false,
    tool: null as PhotoPoint | null,
    travel: 0,
  };
}

export function BrushGameRealistic({ ctx, onDone }: { ctx: MiniCtx; onDone: (result: BrushResult) => void }) {
  const [config] = useState(() => brushDifficulty(ctx.cat.trust, ctx.cat.stress, ctx.brushLevel ?? 0));
  const [state, setState] = useState(() => newBrush(config));
  const [frame, setFrame] = useState<ReturnType<typeof photoMouth>>("closed");
  const [tool, setTool] = useState<PhotoPoint | null>(null);
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState(false);
  const scene = useRef<HTMLDivElement>(null);
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
      const rawHold = current.key || (touch ? current.pointers.lip !== null : current.lift >= .04);
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
      current.travel = 0;
      setFrame(photoMouth(current.key ? .04 : current.lift, touch || paste || current.locked || struggling || !!game.result));
      setTool(game.result ? null : current.tool);
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
    if (current.pointers.lip === event.pointerId) {
      current.lift = Math.max(0, current.startY - point(event).y);
      if (current.lift < .04) current.travel = 0;
    }
    if (current.pointers.tool !== event.pointerId) return;
    const position = point(event);
    if (current.tool) {
      if (paste) current.travel += Math.hypot(position.x - current.tool.x, position.y - current.tool.y) * 2.4;
      else if (!current.locked && (current.key || current.lift >= .04)) {
        const target = photoTarget(position, config.teeth);
        if (target !== photoTarget(current.tool, config.teeth)) current.travel = 0;
        current.travel += photoStroke(current.tool, position, config.teeth);
      }
    }
    current.tool = position;
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

  const activeTooth = frame === "teeth" && tool ? photoTarget(tool, config.teeth) : null;
  const marker = paste ? noseZone : lipZone;
  const status = state.result?.bitten ? "貓咪咬人了" : state.result?.ran ? "貓咪跑走了"
    : state.result ? "練習完成" : struggle ? "貓咪在搖頭，請放手再試" : "";
  return <>
    <p className={styles.hint} id="brush-photo-hint"><strong>{title}：</strong>{hint}
      {!paste && " 桌面可按住空白鍵，再用滑鼠拖曳工具。"}
    </p>
    <div ref={scene} className={photo.stage} data-mouth={frame} role="group" aria-label="刷牙練習影像"
      aria-describedby="brush-photo-hint" tabIndex={0}
      onPointerDown={down} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      {(["closed", "lift", "teeth"] as const).map(name => (
        <Image key={name} src={"/play/brush/brush-" + name + ".webp"} alt={name === "closed" ? "AI 合成虎斑貓練習影像" : ""}
          fill unoptimized loading="eager" draggable={false}
          fetchPriority={name === "closed" ? "high" : "low"}
          onLoad={() => setLoaded(images => images.has(name) ? images : new Set(images).add(name))}
          onError={() => setFailed(true)}
          className={name === "closed" ? undefined : photo.mouth} hidden={name !== "closed" && name !== frame} />
      ))}
      {ready && !state.result && <svg className={photo.overlay} viewBox="0 0 1086 1448" aria-hidden="true">
        {frame === "closed" && <circle className={photo.marker} cx={marker.x * 1086} cy={marker.y * 1448} r="23" />}
        {frame === "teeth" && toothZones(config.teeth).map((zone, index) => (
          <circle key={index} className={photo.tooth} data-active={index === activeTooth || state.clean[index] === 1}
            cx={zone.x * 1086} cy={zone.y * 1448} r={index === activeTooth ? 11 : 6} />
        ))}
        {tool && <g transform={`translate(${tool.x * 1086} ${tool.y * 1448}) rotate(25)`}>
          <rect x="2" y="-9" width={config.phase === "brush" ? 145 : 70} height="18" rx="9" className={photo.handle} />
          <rect x="-14" y="-11" width="28" height="22" rx="7" className={photo.tip} />
        </g>}
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
