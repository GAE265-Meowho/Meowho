"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { brushDifficulty, brushPointers, brushScore, brushStep, brushStruggling, newBrush, type BrushResult } from "@/lib/play/mini3d/brush-rules";
import { brushPhotoFeedback, closeupPoint, inPhotoZone, lipZone, mouthCloseup, pasteZone, photoSize, photoMouth, photoPoint, photoStroke, photoTarget, toothZones, type PhotoPoint } from "@/lib/play/mini3d/brush-photo-regions";
import type { MiniCtx } from "../catgame/minis";
import styles from "./mini3d.module.css";
import { BrushPhotoTool } from "./BrushPhotoTool";
import { BrushReactionVideo } from "./BrushReactionVideo";
import photo from "./brush-photo.module.css";

const instructions = {
  touch: ["碰嘴角", "按住嘴角標記。"],
  lift: ["翻開嘴角", "按住嘴角標記向上拖，保持露牙。"],
  paste: ["嚐嚐牙膏", "把沾少量貓用牙膏的手指移到嘴唇旁，讓貓咪慢慢舔。"],
  finger: ["指套刷牙", "一指輕輕翻唇，另一指用指套小幅擦刷牙齒外側。"],
  brush: ["牙刷刷牙", "輕輕翻唇，用軟毛刷沿犬齒與後方頰齒的外側小幅輕刷。"],
} as const;

function newInput() {
  return {
    pointers: { lip: null, tool: null } as Parameters<typeof brushPointers>[0],
    startY: 0,
    lift: 0,
    key: false,
    keyLift: 0,
    tool: null as PhotoPoint | null,
    angle: 0,
    travel: 0,
    contacted: false,
  };
}

export function BrushGameRealistic({
  ctx, onDone, reactionSrc = "/play/brush/brush-turn-away.mp4",
}: {
  ctx: MiniCtx;
  onDone: (result: BrushResult) => void;
  reactionSrc?: string;
}) {
  const [config] = useState(() => brushDifficulty(ctx.cat.trust, ctx.cat.stress, ctx.brushLevel ?? 0));
  const [state, setState] = useState(() => newBrush(config));
  const [frame, setFrame] = useState<ReturnType<typeof photoMouth>>("closed");
  const [activeTooth, setActiveTooth] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState(false);
  const [reaction, setReaction] = useState<"education" | "struggle" | null>(null);
  const reactionPlaying = useRef<typeof reaction>(null);
  const educationShown = useRef(false);
  const scene = useRef<HTMLDivElement>(null);
  const closeup = useRef<SVGSVGElement>(null);
  const toolGraphic = useRef<SVGGElement>(null);
  const lipGraphic = useRef<SVGCircleElement>(null);
  const input = useRef(newInput());
  const started = useRef(false);
  const ready = loaded.size === 3 && !failed;
  const paste = config.phase === "paste";
  const touch = config.phase === "touch";
  const score = brushScore(state);
  const struggle = brushStruggling(state.elapsed, config);
  const remaining = Math.max(0, config.patience - state.elapsed);
  const visibleResult = reaction ? null : state.result;
  const feedback = brushPhotoFeedback(remaining / config.patience, struggle || reaction === "struggle", visibleResult);
  const [title, hint] = instructions[config.phase];

  const endReaction = useCallback(() => {
    reactionPlaying.current = null;
    setReaction(null);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let game = newBrush(config);
    let previous: number | null = null;
    let displayElapsed = 0;
    let visualLift = 0;
    let heldLip: number | null = null;
    let heldSpace = false;
    let forceStruggle = false;
    const requestStruggle = () => { forceStruggle = true; };
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
    const blur = () => {
      heldLip = null;
      heldSpace = false;
      reset();
    };
    const releaseHeldLip = (event: globalThis.PointerEvent) => {
      if (heldLip === event.pointerId) heldLip = null;
    };
    const keyDown = (event: KeyboardEvent) => {
      if (game.result || reactionPlaying.current || brushStruggling(game.elapsed, config) ||
        event.code !== "Space" || event.repeat || paste || !scene.current?.closest("dialog")?.contains(document.activeElement) ||
        (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select, a"))) return;
      event.preventDefault();
      input.current.key = true;
      input.current.keyLift = 0;
      if (touch) input.current.contacted = true;
      if (input.current.pointers.tool === null) input.current.tool = config.teeth ? null : lipZone;
      started.current = true;
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      heldSpace = false;
      input.current.key = false;
      if (!config.teeth) input.current.tool = null;
      input.current.travel = 0;
    };
    const tick = (time: number) => {
      const dt = Math.min(.1, (time - (previous ?? time)) / 1000);
      previous = time;
      const current = input.current;
      if (current.key) current.keyLift = motion?.matches ? .04 : Math.min(.04, current.keyLift + dt * .25);
      const distance = current.key ? current.keyLift : current.lift;
      const rawHold = touch ? current.key || current.pointers.lip !== null : distance >= .04;
      const wasStruggling = brushStruggling(game.elapsed, config);
      let playing = reactionPlaying.current;
      const holding = wasStruggling ? heldSpace || heldLip !== null : rawHold && !playing;
      if (forceStruggle && dt > 0 && !wasStruggling && !playing) {
        forceStruggle = false;
        started.current = true;
        const nextWindow = (Math.floor(game.elapsed / config.struggleEvery) + 1) * config.struggleEvery;
        game = { ...game, elapsed: nextWindow - dt / 2 };
      }
      const nearPaste = !!current.tool && inPhotoZone(current.tool, pasteZone);
      const effectiveContact = current.contacted || (paste ? nearPaste : touch ? rawHold : distance >= .018);
      if (effectiveContact && !educationShown.current && !playing && !wasStruggling
        && !brushStruggling(game.elapsed + dt, config) && reactionSrc) {
        educationShown.current = true;
        reactionPlaying.current = "education";
        setReaction("education");
        reset();
        playing = "education";
      }
      if (started.current && playing !== "education") {
        const target = holding && !wasStruggling && current.tool ? photoTarget(current.tool, config.teeth) : null;
        game = brushStep(game, config, {
          dt,
          holding,
          target,
          travel: current.travel,
          near: !playing && (!paste || nearPaste),
        });
      }
      const struggling = brushStruggling(game.elapsed, config);
      if (struggling && !wasStruggling) {
        // Keep the pressure rule tied to the original hold after releasing browser capture.
        heldSpace = rawHold && current.key;
        heldLip = rawHold && !current.key ? current.pointers.lip : null;
        reset();
        if (reactionSrc && !motion?.matches && !playing) {
          reactionPlaying.current = "struggle";
          setReaction("struggle");
        }
      } else if (!struggling) {
        heldSpace = false;
        heldLip = null;
      }
      const blocked = touch || paste || struggling || playing || !!game.result;
      const mouth = photoMouth(distance, blocked);
      const desiredLift = blocked ? 0 : Math.min(.04, distance);
      if (struggling || playing || game.result?.bitten) visualLift = 0;
      const controllingLip = current.key || current.pointers.lip !== null;
      visualLift = (controllingLip && !blocked) || motion?.matches
        ? desiredLift
        : Math.max(desiredLift, visualLift - dt * .35);
      const node = scene.current;
      // Fade only between adjacent frames. The closed portrait remains the base.
      node?.style.setProperty("--lift-opacity", String(Math.min(1, visualLift / .018)));
      node?.style.setProperty("--teeth-opacity", String(Math.max(0, (visualLift - .018) / .022)));
      const visibleTool = !game.result && !struggling && !playing && (!config.teeth || mouth === "teeth") ? current.tool : null;
      toolGraphic.current?.setAttribute("visibility", visibleTool ? "visible" : "hidden");
      if (visibleTool) {
        toolGraphic.current?.setAttribute("transform",
          `translate(${visibleTool.x * photoSize.width} ${visibleTool.y * photoSize.height}) rotate(${current.angle})`);
      }
      lipGraphic.current?.setAttribute("cy", String((paste ? pasteZone.y : lipZone.y - visualLift) * 1448));
      setActiveTooth(visibleTool && current.travel > 0 ? photoTarget(visibleTool, config.teeth) : null);
      current.travel = 0;
      setFrame(mouth);
      displayElapsed += dt;
      if (displayElapsed >= .08 || wasStruggling !== struggling || game.result) {
        displayElapsed = 0;
        setState(game);
      }
      if (game.result) reset();
      else animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    window.addEventListener("pointerup", releaseHeldLip, true);
    window.addEventListener("pointercancel", releaseHeldLip, true);
    if (process.env.NODE_ENV === "development") window.addEventListener("meow:brush-struggle", requestStruggle);
    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointerup", releaseHeldLip, true);
      window.removeEventListener("pointercancel", releaseHeldLip, true);
      if (process.env.NODE_ENV === "development") window.removeEventListener("meow:brush-struggle", requestStruggle);
      reset();
    };
  }, [config, paste, reactionSrc, ready, touch]);

  function point(event: PointerEvent<HTMLDivElement>) {
    return photoPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  }

  function toolPoint(event: PointerEvent<HTMLDivElement>) {
    if (!config.teeth) return point(event);
    const bounds = closeup.current?.getBoundingClientRect();
    return bounds ? closeupPoint(event.clientX, event.clientY, bounds) : null;
  }

  function down(event: PointerEvent<HTMLDivElement>) {
    if (!ready || state.result || struggle || reactionPlaying.current || event.button !== 0) return;
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
    if (!lip || !config.teeth) current.tool = toolPoint(event);
    if ((touch && lip) || (paste && inPhotoZone(position, pasteZone))) current.contacted = true;
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (state.result || struggle || reactionPlaying.current) return;
    const current = input.current;
    if (event.pointerType === "mouse") {
      event.currentTarget.dataset.lipHover = String(ready && !paste && !state.result
        && !current.key && current.pointers.lip === null && inPhotoZone(point(event), lipZone));
    }
    if (current.pointers.lip === event.pointerId) {
      if (!config.teeth) current.tool = point(event);
      current.lift = Math.max(0, current.startY - point(event).y);
      if (current.lift >= .018) current.contacted = true;
      if (current.lift < .04) current.travel = 0;
    }
    const keyboardMouse = current.key && event.pointerType === "mouse" && current.pointers.tool === null;
    if (current.pointers.tool !== event.pointerId && !keyboardMouse) return;
    const position = toolPoint(event);
    if (!position) {
      current.tool = null;
      current.travel = 0;
      return;
    }
    if (current.tool) {
      const dx = position.x - current.tool.x;
      const dy = position.y - current.tool.y;
      if (Math.hypot(dx, dy) > .001) {
        current.angle = Math.max(-12, Math.min(12, dy * Math.sign(dx || 1) * 900));
      }
      if (paste) current.travel += Math.hypot(position.x - current.tool.x, position.y - current.tool.y) * 2.4;
      else if (current.key ? current.keyLift >= .04 : current.lift >= .04) {
        const target = photoTarget(position, config.teeth);
        if (target !== photoTarget(current.tool, config.teeth)) current.travel = 0;
        current.travel += photoStroke(current.tool, position, config.teeth);
      }
    }
    current.tool = position;
    if (paste && inPhotoZone(position, pasteZone)) current.contacted = true;
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
      if (!config.teeth && !paste) current.tool = null;
      current.travel = 0;
    }
    if (current.pointers.tool === event.pointerId) {
      current.tool = null;
      current.travel = 0;
    }
    current.pointers = brushPointers(current.pointers, event.pointerId, "release");
  }

  const marker = paste ? pasteZone : lipZone;
  const status = feedback === "bitten" ? "哎呀，被咬到了。先讓貓咪休息。"
    : feedback === "ran" ? "貓咪走開了，下次再練習。"
    : feedback === "success" ? "做得好，完成這一階段的照護練習！"
    : feedback === "resisting" ? "貓咪開始抗拒，請放開嘴角休息。"
    : feedback === "warning" ? "貓咪開始不耐煩了，放慢動作，抗拒時就停下。"
    : "";
  const tool = <g ref={toolGraphic} visibility="hidden"><BrushPhotoTool phase={config.phase} /></g>;
  const cropViewBox = [
    mouthCloseup.x * photoSize.width, mouthCloseup.y * photoSize.height,
    mouthCloseup.width * photoSize.width, mouthCloseup.height * photoSize.height,
  ].join(" ");
  return <>
    <p className={styles.hint} id="brush-photo-hint"><strong>{title}：</strong>{hint}
      {!paste && " 桌面可按住空白鍵，移動滑鼠操作。"}
    </p>
    <div ref={scene} className={photo.stage} data-mouth={frame} data-feedback={feedback} role="group" aria-label="刷牙練習影像"
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
      {reaction && reactionSrc && <BrushReactionVideo src={reactionSrc} education={reaction === "education"} onFinish={endReaction} />}
      {ready && !state.result && !struggle && !reaction && <svg className={photo.overlay} viewBox="0 0 1086 1448" aria-hidden="true">
        <circle ref={lipGraphic} className={photo.marker} cx={marker.x * 1086} cy={marker.y * 1448} r="23" />
        {!config.teeth && tool}
      </svg>}
      {ready && !state.result && config.teeth > 0 && frame === "teeth" &&
        <svg ref={closeup} className={photo.closeup} viewBox={cropViewBox} aria-label="牙齒外側特寫">
          <image href="/play/brush/brush-teeth.webp" width={photoSize.width} height={photoSize.height} />
          {toothZones(config.teeth).map((zone, index) => (
            <ellipse key={index} className={photo.tooth} data-active={index === activeTooth}
              data-clean={state.clean[index] === 1}
              cx={zone.x * photoSize.width} cy={zone.y * photoSize.height}
              rx={zone.rx * photoSize.width * .78} ry={zone.ry * photoSize.height * .65} />
          ))}
          {tool}
        </svg>}
    </div>
    {failed ? <p role="alert">無法載入刷牙影像，請關閉後再試。</p> : !ready && <p role="status">刷牙影像載入中…</p>}
    <div className={`${styles.meters} ${photo.meters}`} data-feedback={feedback}>
      <label>進度 <progress max={100} value={score} /> {score}%</label>
      <label>耐心 <progress max={config.patience} value={remaining} /></label>
    </div>
    {config.teeth > 0 && !state.result && <p className={styles.hint}>
      沿著特寫中的近似牙齦邊緣，輕輕來回刷。刷毛朝向牙齦，與牙齒長軸約成 45°（方向示意）。
    </p>}
    <p className={`${styles.status} ${photo.feedback}`} data-feedback={feedback} role="status">
      {reaction === "education" ? "衛教示範｜貓咪轉頭躲避時，請停止接觸，等牠放鬆後再嘗試。" : status}
    </p>
    {reaction === "education" && <button className="btn" type="button" onClick={endReaction}>略過衛教示範</button>}
    {visibleResult && <button className="btn" type="button" onClick={() => onDone(visibleResult)}>確認結果</button>}
    <p>AI 模擬畫面，僅供參考，非醫療建議。</p>
  </>;
}
