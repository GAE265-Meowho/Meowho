"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  frameTaiwan, homePinScale, layoutHomes, TAIWAN_MAP, taiwanFocus,
  type HomePin,
} from "@/lib/adopt-map";
import type { FeedCat } from "@/lib/adopt-feed";
import TaiwanCanvas from "./TaiwanCanvas";
import styles from "./adoptMap.module.css";

type Props = {
  cats: FeedCat[];
  /** 沒過篩選的貓仍留在地圖上，只是變淡。沒傳就全部正常顯示。 */
  matches?: (catId: string) => boolean;
  /** 點喵戶裡的貓，連到「認識這隻貓」介紹頁。 */
  catHref: (catId: string) => string;
  /** 測試可傳入。沒傳就向 /api/where 問上網所在縣市。 */
  initialCity?: string | null;
};

type Camera = { x: number; y: number; scale: number };

function limits(fit: number) {
  return { min: fit * 0.65, max: Math.max(fit * 14, 4) };
}

export default function AdoptMap({ cats, matches = () => true, catHref, initialCity }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const cam = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const fitRef = useRef(1);
  const drag = useRef<{ id: number; x: number; y: number; camX: number; camY: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number; x: number; y: number } | null>(null);
  const [towns, setTowns] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(initialCity === undefined ? null : initialCity);
  const [district, setDistrict] = useState<string | null>(null);

  const pins = useMemo(() => layoutHomes(cats), [cats]);
  const open = pins.find((pin) => pin.id === openId) ?? null;
  const openCats = open ? open.catIds.flatMap((id) => {
    const cat = cats.find((item) => item.id === id);
    return cat ? [cat] : [];
  }) : [];

  const apply = () => {
    const node = worldRef.current;
    const view = viewportRef.current;
    if (!node || !view) return;
    const { x, y, scale } = cam.current;
    node.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    node.style.setProperty("--pin-scale", String(homePinScale(scale, fitRef.current)));
    const nextTowns = fitRef.current > 0 && scale / fitRef.current >= 2.2;
    setTowns((cur) => (cur === nextTowns ? cur : nextTowns));
  };

  const zoomAt = (clientX: number, clientY: number, nextScale: number) => {
    const view = viewportRef.current?.getBoundingClientRect();
    if (!view) return;
    const range = limits(fitRef.current);
    const scale = Math.min(range.max, Math.max(range.min, nextScale));
    const px = clientX - view.left;
    const py = clientY - view.top;
    const ratio = scale / cam.current.scale;
    cam.current = {
      scale,
      x: px - (px - cam.current.x) * ratio,
      y: py - (py - cam.current.y) * ratio,
    };
    apply();
  };

  useEffect(() => {
    if (initialCity !== undefined) return;
    let stop = false;
    fetch("/api/where")
      .then((res) => res.json())
      .then((data: { city?: unknown; district?: unknown }) => {
        if (stop) return;
        setCity(typeof data.city === "string" ? data.city : null);
        setDistrict(typeof data.district === "string" ? data.district : null);
      })
      .catch(() => { if (!stop) { setCity(null); setDistrict(null); } });
    return () => { stop = true; };
  }, [initialCity]);

  useLayoutEffect(() => {
    const view = viewportRef.current?.getBoundingClientRect();
    if (!view || view.width < 20) return;
    fitRef.current = Math.min(view.width / TAIWAN_MAP.width, view.height / TAIWAN_MAP.height);
    const focus = city ? taiwanFocus(city, district) : null;
    cam.current = frameTaiwan({ width: view.width, height: view.height }, focus, district ? 8.5 : 3.4);
    apply();
  }, [city, district]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14;
      zoomAt(event.clientX, event.clientY, cam.current.scale * factor);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, a")) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 1) {
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, camX: cam.current.x, camY: cam.current.y, moved: false };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        scale: cam.current.scale,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      };
      drag.current = null;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAt(pinch.current.x, pinch.current.y, pinch.current.scale * (distance / pinch.current.distance));
      return;
    }
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.hypot(dx, dy) > 4) current.moved = true;
    cam.current = { ...cam.current, x: current.camX + dx, y: current.camY + dy };
    apply();
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag.current?.id === event.pointerId) drag.current = null;
  };

  const zoomButton = (direction: 1 | -1) => {
    const view = viewportRef.current?.getBoundingClientRect();
    if (!view) return;
    zoomAt(view.left + view.width / 2, view.top + view.height / 2, cam.current.scale * (direction > 0 ? 1.25 : 0.8));
  };

  return (
    <div className={styles.viewport} ref={viewportRef} aria-label="台灣地圖，可以拖曳與縮放"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
    >
      <div
        className={styles.world}
        ref={worldRef}
        style={{ width: TAIWAN_MAP.width, height: TAIWAN_MAP.height }}
      >
        <TaiwanCanvas showTowns={towns} />
        {pins.length === 0 && <p className={styles.empty} role="status">這裡還沒有等家的貓</p>}
        {pins.map((pin) => (
          <HomePinButton
            key={pin.id}
            pin={pin}
            dim={!pin.catIds.some((id) => matches(id))}
            pressed={openId === pin.id}
            onOpen={() => setOpenId(pin.id)}
          />
        ))}
      </div>
      <span className={styles.compass}>北</span>
      <div className={styles.zoom}>
        <button type="button" onClick={() => zoomButton(1)} aria-label="放大地圖">＋</button>
        <button type="button" onClick={() => zoomButton(-1)} aria-label="縮小地圖">－</button>
      </div>
      {open && (
        <div className={styles.sheet} role="dialog" aria-label={open.name}>
          <div className={styles.sheetHead}>
            <div>
              <strong>{open.name}</strong>
              <span>{`${open.city}${open.district}`}・{openCats.length} 隻在等家</span>
            </div>
            <button type="button" onClick={() => setOpenId(null)}>關閉</button>
          </div>
          <ul className={styles.catRow}>
            {openCats.map((cat) => (
              <li key={cat.id}>
                <Link href={catHref(cat.id)} className={styles.catChip} aria-label={`認識${cat.name}`}>
                  {cat.photo ? <img src={cat.photo} alt="" /> : <span className={styles.catPh} />}
                  <strong>{cat.name}</strong>
                  <span>{cat.tags.slice(0, 2).join("・") || cat.stage}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function HomePinButton({ pin, dim, pressed, onOpen }: {
  pin: HomePin; dim: boolean; pressed: boolean; onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.pin} ${dim ? styles.dim : ""} ${pressed ? styles.pinOn : ""}`}
      style={{ left: `${(pin.x / TAIWAN_MAP.width) * 100}%`, top: `${(pin.y / TAIWAN_MAP.height) * 100}%` }}
      aria-pressed={pressed}
      aria-label={`${pin.name}，${pin.city}${pin.district}，${pin.catIds.length} 隻`}
      onClick={onOpen}
    >
      <span className={styles.pinCount}>{pin.catIds.length}</span>
      <span className={styles.pinName}>{pin.name}</span>
    </button>
  );
}
