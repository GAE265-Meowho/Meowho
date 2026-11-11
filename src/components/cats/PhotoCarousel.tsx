"use client";
/* eslint-disable @next/next/no-img-element */
// 貓咪頁的照片輪播（#354）：直式、橫式照片都完整顯示，不裁切。
// 外框比例固定（桌機 5:4、手機 1:1），每張照片用 contain 放進去，所以滑動時高度不會變。
// 照片填不滿的地方，墊同一張照片的模糊版，不留空白。
// 可以用手指滑、按左右箭頭、或點下面的縮圖；三種方式都同步到同一個「現在第幾張」。
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { slideIndex, stepIndex } from "@/lib/carousel";
import s from "./photoCarousel.module.css";

const Chevron = ({ left = false }: { left?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden style={left ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function PhotoCarousel({ photos, name }: { photos: string[]; name: string }) {
  const track = useRef<HTMLDivElement>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const count = photos.length;

  // 手指滑動時，由捲動位置更新現在第幾張
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setCurrent(slideIndex(el.scrollLeft, el.clientWidth, count));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [count]);

  // 現在這張的縮圖捲進看得到的範圍（只左右捲縮圖列，不動整頁）
  useEffect(() => {
    const row = thumbs.current;
    const btn = row?.children[current] as HTMLElement | undefined;
    if (!row || !btn) return;
    const left = btn.offsetLeft - (row.clientWidth - btn.offsetWidth) / 2;
    row.scrollTo({ left, behavior: "auto" });
  }, [current]);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };

  if (count === 0) {
    return (
      <div className={s.gallery}>
        <div className={`${s.frame} ${s.empty}`}><Icon name="cat" size={96} /></div>
      </div>
    );
  }

  return (
    <div className={s.gallery}>
      <div className={s.frame} role="group" aria-roledescription="輪播" aria-label={`${name}的照片`}>
        <div className={s.track} ref={track}>
          {photos.map((src, i) => (
            <div key={src} className={s.slide} role="group" aria-roledescription="照片" aria-label={`第 ${i + 1} 張，共 ${count} 張`}>
              <img className={s.backdrop} src={src} alt="" aria-hidden />
              <img className={s.photo} src={src} alt={`${name}的照片 ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} draggable={false} />
            </div>
          ))}
        </div>
        {count > 1 && (
          <>
            <button type="button" className={`${s.arrow} ${s.prev}`} aria-label="上一張" disabled={current === 0} onClick={() => go(stepIndex(current, -1, count))}>
              <Chevron left />
            </button>
            <button type="button" className={`${s.arrow} ${s.next}`} aria-label="下一張" disabled={current === count - 1} onClick={() => go(stepIndex(current, 1, count))}>
              <Chevron />
            </button>
            <span className={s.counter} aria-hidden>{current + 1} / {count}</span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className={s.thumbs} ref={thumbs}>
          {photos.map((src, i) => (
            <button key={src} type="button" aria-label={`第 ${i + 1} 張照片`} aria-pressed={i === current} onClick={() => go(i)}>
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
