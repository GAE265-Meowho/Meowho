"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./brush-photo.module.css";

export function BrushReactionVideo({ src, onFinish }: { src: string; onFinish: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const node = video.current;
    if (!node) return;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (motion?.matches) {
      onFinish();
      return;
    }
    let active = true;
    const finish = () => { if (active) onFinish(); };
    const motionChanged = (event: MediaQueryListEvent) => { if (event.matches) finish(); };
    const timeout = window.setTimeout(finish, 2500);
    motion?.addEventListener?.("change", motionChanged);
    node.play().catch(finish);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      motion?.removeEventListener?.("change", motionChanged);
    };
  }, [src, onFinish]);

  return <video ref={video} className={styles.reaction} data-playing={playing} src={src}
    muted playsInline preload="none" aria-hidden="true"
    onPlaying={() => setPlaying(true)} onEnded={onFinish} onError={onFinish} />;
}
