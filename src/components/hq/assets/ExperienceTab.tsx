"use client";
// 虛擬體驗（#150，Tina 2026-11-03）：選一隻虛擬貓、選一戶喵戶，把貓放進那戶的 3D 室內空間。之後做互動遊戲的基礎。
// 貓＝共用母體 base_clips.glb＋這隻貓已確認的貼圖（同貓咪頁，catLook.ts）；房間＝平面圖轉換讀圖完成的房間。
// 選擇寫進網址（?tab=experience&cat=&house=），複製連結給其他管理員看到同一個畫面。
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FloorplanHouse, FloorplanSummary } from "@/lib/hq/floorplans/types";
import { HqLoadError, HqSkeleton } from "../HqStates";
import { catLook } from "./catLook";
import { FLOORPLAN_API } from "./floorplanApi";
import { assetSectionHref } from "./hrefs";
import { useCatList } from "./useCatModels";

const FloorplanViewer = dynamic(() => import("./FloorplanViewer"), { ssr: false, loading: () => <HqSkeleton rows={4} /> });

type Load<T> = { state: "loading" } | { state: "error" } | { state: "ready"; data: T };

function useHouses() {
  const [value, setValue] = useState<Load<FloorplanSummary[]>>({ state: "loading" });
  useEffect(() => {
    let alive = true;
    fetch(FLOORPLAN_API, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { houses?: FloorplanSummary[] }) => { if (alive) setValue({ state: "ready", data: j.houses ?? [] }); })
      .catch(() => { if (alive) setValue({ state: "error" }); });
    return () => { alive = false; };
  }, []);
  return value;
}

function useHouse(id: string | null) {
  const [value, setValue] = useState<Load<FloorplanHouse> | null>(null);
  useEffect(() => {
    if (!id) { setValue(null); return; }
    let alive = true;
    setValue({ state: "loading" });
    fetch(`${FLOORPLAN_API}/${id}`, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { house: FloorplanHouse }) => { if (alive) setValue({ state: "ready", data: j.house }); })
      .catch(() => { if (alive) setValue({ state: "error" }); });
    return () => { alive = false; };
  }, [id]);
  return value;
}

export function ExperienceTab() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const cats = useCatList().value;
  const houses = useHouses();
  const [room, setRoom] = useState<string | null>(null);

  // 只列出有確認貼圖的貓、有讀圖完成房間的喵戶
  const catOptions = useMemo(() => (cats.state === "ready" ? cats.data.filter(c => catLook(c)) : []), [cats]);
  const houseOptions = useMemo(() => (houses.state === "ready" ? houses.data.filter(h => h.rooms.some(r => r.status === "ready")) : []), [houses]);
  const catId = catOptions.some(c => c.id === params.get("cat")) ? params.get("cat") : catOptions[0]?.id ?? null;
  const houseId = houseOptions.some(h => h.id === params.get("house")) ? params.get("house") : houseOptions[0]?.id ?? null;
  const house = useHouse(houseId);
  const cat = catOptions.find(c => c.id === catId) ?? null;
  const look = cat ? catLook(cat) : null;

  const choose = (key: "cat" | "house", value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", "experience");
    next.set(key, value);
    if (key === "house") setRoom(null);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  if (cats.state === "loading" || houses.state === "loading") return <HqSkeleton rows={4} />;
  if (cats.state !== "ready" || houses.state !== "ready") return <HqLoadError onRetry={() => window.location.reload()} />;

  return (
    <>
      <div className="hq-exp-pick">
        <label className="hq-box">
          <span className="hq-label">虛擬貓</span>
          {catOptions.length
            ? <select className="hq-input" value={catId ?? ""} onChange={e => choose("cat", e.target.value)}>
              {catOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            : <span className="hq-hint">還沒有完成紋理貼圖的貓。<Link href={assetSectionHref("cats")}>到貓咪製作</Link></span>}
        </label>
        <label className="hq-box">
          <span className="hq-label">喵戶</span>
          {houseOptions.length
            ? <select className="hq-input" value={houseId ?? ""} onChange={e => choose("house", e.target.value)}>
              {houseOptions.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            : <span className="hq-hint">還沒有讀圖完成的室內空間。<Link href={assetSectionHref("rooms-floorplan")}>到平面圖轉換</Link></span>}
        </label>
      </div>

      <section className="hq-box" aria-label="3D 虛擬體驗">
        <h3>{cat && house?.state === "ready" ? `${cat.name} 在 ${house.data.name}` : "3D 虛擬體驗"}</h3>
        {!look || !houseId ? <div className="hq-texture-empty" role="status"><strong>選好虛擬貓和喵戶後，貓會出現在房間裡</strong></div>
          : !house || house.state === "loading" ? <HqSkeleton rows={4} />
            : house.state === "error" ? <HqLoadError onRetry={() => choose("house", houseId)} />
              : (
                <>
                  <p className="hq-hint">點地板，貓會走過去；閒置一陣子會自己逛。上方可以切換房間。</p>
                  <FloorplanViewer key={`${houseId}:${cat?.id}`} rooms={house.data.rooms} selected={room} onPick={setRoom} cat={look} />
                </>
              )}
      </section>
    </>
  );
}
