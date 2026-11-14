"use client";
// 虛擬飼養：15 歲結局的暗幕與回顧（#354，渝茜 2026-11-14）。時間軸與規則在 lib/play/ending.ts。
//   暗幕（畫面慢慢全黑）→ 黑畫面（升天音樂這時才進來，顯示「享年」那句）→ 漸亮回顧遊戲中自動截下的畫面（每張停 2～3 秒、淡入淡出、極輕微推近）
//   → 漸白 → onDone（進結案報告）。點畫面、按「略過」或 Esc 直接到報告。
//   一張截圖都沒有時，回顧用 2D 備用插圖（FarewellScene 的星空與貓掌印）。prefers-reduced-motion：不推移、直接換。
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ENDING_MS, endingSchedule, type EndingPhase, type ReviewShot } from "@/lib/play/ending";
import { FarewellScene } from "./FarewellScene";
import e from "./ending.module.css";

export function EndingOverlay({ slides, caption, onPhase, onDone }: {
  slides: readonly ReviewShot[];
  /** 黑畫面裡的那句（story.ts 的 farewellCaption） */
  caption: string;
  onPhase: (phase: EndingPhase) => void;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<EndingPhase>("dark");
  const [slide, setSlide] = useState(-1);
  const done = useRef(false);
  const finish = useRef(onDone);
  finish.current = onDone;
  const report = useRef(onPhase);
  report.current = onPhase;
  const skip = () => { if (done.current) return; done.current = true; finish.current(); };

  useEffect(() => {
    const timers = endingSchedule(slides.length).map(s => setTimeout(() => {
      setPhase(s.phase);
      report.current(s.phase);
      if (s.slide !== undefined) setSlide(s.slide);
      if (s.phase === "done") skip();
    }, s.at));
    report.current("dark");
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") skip(); };
    addEventListener("keydown", esc);
    return () => { timers.forEach(clearTimeout); removeEventListener("keydown", esc); };
    // 時間軸只在進場時排一次（回顧照在開始時就定好了）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vars = {
    "--dark-ms": `${ENDING_MS.dark}ms`, "--white-ms": `${ENDING_MS.white}ms`, "--fade-ms": `${ENDING_MS.fade}ms`, "--slide-ms": `${ENDING_MS.slide + ENDING_MS.fade}ms`,
  } as CSSProperties;
  const showSlides = phase === "review" || phase === "white" || phase === "done";
  return (
    <div className={e.overlay} style={vars} data-phase={phase} onClick={skip} role="presentation" data-testid="ending">
      <div className={e.black} />
      <p className={e.caption} aria-live="polite">{phase === "hush" ? caption : ""}</p>
      <div className={e.slides} aria-hidden={!showSlides}>
        {slides.length ? slides.map((s, i) => (
          <figure key={s.key} className={e.slide} data-on={showSlides && i === slide ? "true" : "false"}>
            <div className={e.frame}>
              {/* 遊戲中自動截下的 data URL，不經 next/image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt={s.label ? `回顧：${s.label}` : "回顧"} />
            </div>
            {s.label && <figcaption className={e.label}>{s.label}</figcaption>}
          </figure>
        )) : (
          <figure className={e.slide} data-on={showSlides ? "true" : "false"}>
            <div className={e.frame}><div className={e.fallback}><FarewellScene phase="gone" /></div></div>
          </figure>
        )}
      </div>
      <div className={e.white} />
      <button type="button" className={e.skip} onClick={ev => { ev.stopPropagation(); skip(); }}>略過</button>
    </div>
  );
}
