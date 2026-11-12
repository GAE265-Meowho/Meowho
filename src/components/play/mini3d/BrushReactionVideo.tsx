"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./brush-photo.module.css";

export function BrushReactionVideo({ src, education = false, onFinish }: { src: string; education?: boolean; onFinish: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const node = video.current;
    if (!node) return;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (motion?.matches && !education) {
      onFinish();
      return;
    }
    let active = true;
    const trace = (event: string) => {
      if (process.env.NODE_ENV === "development") console.debug("[brush-reaction]", event, {
        currentTime: node.currentTime, readyState: node.readyState, paused: node.paused,
        error: node.error?.code,
      });
    };
    const finish = (reason: string) => {
      if (!active) return;
      active = false;
      trace(reason);
      onFinish();
    };
    const motionChanged = (event: MediaQueryListEvent) => { if (event.matches && !education) finish("reduced-motion"); };
    let playbackTimeout: number | undefined;
    const startupTimeout = window.setTimeout(() => finish("startup-timeout"), 2500);
    const playing = () => {
      trace("playing");
      window.clearTimeout(startupTimeout);
      setPlaying(true);
      playbackTimeout ??= window.setTimeout(() => finish("playback-timeout"), 5000);
    };
    const ended = () => finish("ended");
    const failed = () => finish("error");
    motion?.addEventListener?.("change", motionChanged);
    node.addEventListener("playing", playing);
    node.addEventListener("ended", ended);
    node.addEventListener("error", failed);
    trace("play");
    node.play().catch(() => finish("play-rejected"));
    return () => {
      active = false;
      window.clearTimeout(startupTimeout);
      window.clearTimeout(playbackTimeout);
      motion?.removeEventListener?.("change", motionChanged);
      node.removeEventListener("playing", playing);
      node.removeEventListener("ended", ended);
      node.removeEventListener("error", failed);
    };
  }, [src, education, onFinish]);

  return <video ref={video} className={styles.reaction} data-playing={playing} data-education={education} src={src}
    muted playsInline preload="none" aria-hidden="true" />;
}
