"use client";
// 虛擬飼養 DEMO（#237）：五個小遊戲，2D 疊在 3D 畫面上（.mini 蓋住舞台）。計分與結果文字在 src/lib/play/minigames.ts。
// 玩法從 catgame 的小遊戲精簡：外出籠、放飯、鏟屎、剪指甲、餵藥。按鈕都可用鍵盤操作；會動的指示條在「減少動態效果」時放慢。
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { useReducedMotion } from "@/lib/useReducedMotion";
import {
  CARRIER_TRUST_NEEDED, MINI_TITLES, NAIL_PATIENCE, carrierResult, feedResult, nailResult, pillResult, scoopResult, type MiniResult,
} from "@/lib/play/minigames";
import type { MiniId } from "@/lib/play/story";
import s from "./play.module.css";

type Done = (r: MiniResult) => void;

/** 0–100 來回移動的指示條（剪指甲、餵藥用） */
function useSweep(running: boolean) {
  const reduced = useReducedMotion();
  const [pos, setPos] = useState(0);
  const dir = useRef(1);
  useEffect(() => {
    if (!running) return;
    const step = reduced ? 1 : 1.8;
    const t = setInterval(() => {
      setPos(p => {
        let n = p + dir.current * step;
        if (n >= 100) { n = 100; dir.current = -1; }
        if (n <= 0) { n = 0; dir.current = 1; }
        return n;
      });
    }, 30);
    return () => clearInterval(t);
  }, [running, reduced]);
  return pos;
}

function Carrier({ onDone }: { onDone: Done }) {
  const [trust, setTrust] = useState(0);
  const [treats, setTreats] = useState(0);
  const [rushed, setRushed] = useState(0);
  const [note, setNote] = useState("籠子裡的麻糬盯著你看。放幾顆零食，等牠願意靠近籠門。");
  const open = () => {
    if (trust >= CARRIER_TRUST_NEEDED) { onDone(carrierResult(treats, rushed)); return; }
    const r = rushed + 1;
    setRushed(r); setTrust(t => Math.max(0, t - 1));
    setNote("你伸手太快，牠又縮回最裡面了。");
    if (r >= 3) onDone(carrierResult(treats, r));
  };
  return (
    <>
      <div className={s.paws} aria-label={`信任 ${trust}／${CARRIER_TRUST_NEEDED}`}>
        {Array.from({ length: CARRIER_TRUST_NEEDED }, (_, i) => <span key={i} className={i < trust ? "" : s.off}><Icon name="paw" size={28} /></span>)}
      </div>
      <p className={s.miniNote} aria-live="polite">{note}</p>
      <div className={s.miniRow}>
        <button type="button" className={s.miniBtn} onClick={() => {
          setTreats(n => n + 1); setTrust(t => Math.min(CARRIER_TRUST_NEEDED, t + 1));
          setNote(trust + 1 >= CARRIER_TRUST_NEEDED ? "牠把頭探出籠門，聞了聞你的手。" : "牠往前挪了一點點。");
        }}>放一顆零食</button>
        <button type="button" className={`${s.miniBtn} ${s.ghost}`} onClick={open}>打開籠門讓牠出來</button>
      </div>
    </>
  );
}

/** 幼貓一天約五十公克乾糧、分三餐：一餐約十六公克（DEMO 估算，實際照包裝建議） */
const MEAL_G = 16;
const MAX_G = 40;
function Feed({ onDone }: { onDone: Done }) {
  const [g, setG] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  const start = () => { stop(); timer.current = setInterval(() => setG(v => Math.min(MAX_G, v + 0.5)), 50); };
  useEffect(() => stop, []);
  return (
    <>
      <p className={s.miniNote}>按住按鈕倒飼料，黑線是建議的一餐份量。也可以一下一下點。</p>
      <div className={s.meter} role="img" aria-label={`已倒 ${Math.round(g)} 公克`}>
        <span style={{ width: `${(g / MAX_G) * 100}%` }} />
        <i className={s.target} style={{ left: `${(MEAL_G / MAX_G) * 100}%` }} />
      </div>
      <p className={s.miniNote} aria-live="polite">{Math.round(g)} 公克</p>
      <div className={s.miniRow}>
        <button type="button" className={s.miniBtn}
          onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
          onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setG(v => Math.min(MAX_G, v + 1)); } }}
          onContextMenu={e => e.preventDefault()}>按住倒飼料</button>
        <button type="button" className={`${s.miniBtn} ${s.ghost}`} disabled={g === 0} onClick={() => { stop(); onDone(feedResult(g, MEAL_G)); }}>倒好了</button>
      </div>
    </>
  );
}

/** 鏟屎：固定的砂團位置（每次一樣），十五秒內點掉 */
const CLUMPS = [1, 6, 8, 11, 14];
const SCOOP_SECONDS = 15;
function Scoop({ onDone }: { onDone: Done }) {
  const [found, setFound] = useState<number[]>([]);
  const [left, setLeft] = useState(SCOOP_SECONDS);
  const finished = useRef(false);
  const finish = (n: number) => { if (finished.current) return; finished.current = true; onDone(scoopResult(n, CLUMPS.length)); };
  useEffect(() => {
    const t = setInterval(() => setLeft(v => v - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (left <= 0) finish(found.length); });
  return (
    <>
      <p className={s.miniNote} aria-live="polite">點掉貓砂盆裡的砂團。還剩 {Math.max(0, left)} 秒。</p>
      <div className={s.grid}>
        {Array.from({ length: 16 }, (_, i) => {
          const clump = CLUMPS.includes(i) && !found.includes(i);
          return (
            <button key={i} type="button" className={s.cell} data-clump={clump} disabled={!clump}
              aria-label={clump ? "砂團" : "乾淨的砂"}
              onClick={() => {
                const next = [...found, i];
                setFound(next);
                if (next.length === CLUMPS.length) finish(next.length);
              }} />
          );
        })}
      </div>
    </>
  );
}

const CLAWS = 5;
function Nail({ onDone }: { onDone: Done }) {
  const pos = useSweep(true);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [note, setNote] = useState("指示條走到綠色區（白色的爪尖）時按「剪」。");
  const cut = () => {
    const ok = pos >= 38 && pos <= 62;
    const h = hits + (ok ? 1 : 0), m = misses + (ok ? 0 : 1);
    setHits(h); setMisses(m);
    setNote(ok ? `剪好了第 ${h} 隻。` : "太靠近粉紅色的血線了，牠縮了一下。");
    if (h >= CLAWS || m >= NAIL_PATIENCE) onDone(nailResult(h, m, CLAWS));
  };
  return (
    <>
      <div className={s.meter} role="img" aria-label="剪指甲時機">
        <i className={s.zone} style={{ left: "38%", width: "24%" }} />
        <i className={s.needle} style={{ left: `${pos}%` }} />
      </div>
      <p className={s.miniNote} aria-live="polite">{note}（{hits}／{CLAWS}，耐心剩 {NAIL_PATIENCE - misses}）</p>
      <div className={s.miniRow}>
        <button type="button" className={s.miniBtn} onClick={cut}>剪</button>
        <button type="button" className={`${s.miniBtn} ${s.ghost}`} onClick={() => onDone(nailResult(hits, misses, CLAWS))}>今天先剪到這裡</button>
      </div>
    </>
  );
}

function Pill({ onDone }: { onDone: Done }) {
  const [way, setWay] = useState<"food" | "direct" | "force" | null>(null);
  const [onTime, setOnTime] = useState<boolean | null>(null);
  const pos = useSweep(way !== null && onTime === null);
  if (!way) {
    return (
      <>
        <p className={s.miniNote}>照醫師說的方式餵藥。你要怎麼餵？</p>
        <div className={s.miniRow}>
          <button type="button" className={s.miniBtn} onClick={() => setWay("food")}>醫師說可以時，包進一點肉泥</button>
          <button type="button" className={s.miniBtn} onClick={() => setWay("direct")}>照醫師示範的方式放進嘴裡</button>
          <button type="button" className={`${s.miniBtn} ${s.ghost}`} onClick={() => setWay("force")}>壓住牠硬塞</button>
        </div>
      </>
    );
  }
  if (onTime === null) {
    return (
      <>
        <p className={s.miniNote}>等牠放鬆的時候（綠色區）再餵。</p>
        <div className={s.meter} role="img" aria-label="餵藥時機">
          <i className={s.zone} style={{ left: "35%", width: "30%" }} />
          <i className={s.needle} style={{ left: `${pos}%` }} />
        </div>
        <div className={s.miniRow}>
          <button type="button" className={s.miniBtn} onClick={() => setOnTime(pos >= 35 && pos <= 65)}>餵</button>
        </div>
      </>
    );
  }
  return (
    <>
      <p className={s.miniNote}>{onTime ? "牠乖乖吃下去了。" : "牠有點緊張，不過還是吃下去了。"}要給牠一點獎勵嗎？</p>
      <div className={s.miniRow}>
        <button type="button" className={s.miniBtn} onClick={() => onDone(pillResult(way, onTime, true))}>給一點肉泥，摸摸牠</button>
        <button type="button" className={`${s.miniBtn} ${s.ghost}`} onClick={() => onDone(pillResult(way, onTime, false))}>直接結束</button>
      </div>
    </>
  );
}

const GAMES: Record<MiniId, (p: { onDone: Done }) => React.ReactElement> = { carrier: Carrier, feed: Feed, scoop: Scoop, nail: Nail, pill: Pill };

export function MiniGame({ id, onDone }: { id: MiniId; onDone: Done }) {
  const Game = GAMES[id];
  return (
    <section className={s.mini} aria-labelledby="mini-title">
      <h3 id="mini-title">{MINI_TITLES[id]}</h3>
      <Game onDone={onDone} />
    </section>
  );
}
