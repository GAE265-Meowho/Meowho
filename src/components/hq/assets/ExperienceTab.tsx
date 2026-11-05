"use client";
// 虛擬體驗（#150，Tina 2026-11-03）：選一隻虛擬貓、選一戶喵戶，把貓放進那戶的 3D 室內空間。之後做互動遊戲的基礎。
// 貓＝共用母體 base_clips.glb＋這隻貓已確認的貼圖（同貓咪頁，catLook.ts）；房間＝平面圖轉換讀圖完成的房間。
// 選擇寫進網址（?tab=experience&cat=&house=），複製連結給其他管理員看到同一個畫面。
// 生活用品（#197）：右側選單類別篩選＋小圖示，可拖拉進空間；已放用品可再拖移；也可點選後點地板／桌面放置。
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { HouseholdItem, ItemCategory } from "@/lib/hq/items/types";
import type { FloorplanHouse, FloorplanSummary } from "@/lib/hq/floorplans/types";
import { HqLoadError, HqSkeleton } from "../HqStates";
import { catLook } from "./catLook";
import { ExperienceItemPalette } from "./ExperienceItemPalette";
import { FLOORPLAN_API } from "./floorplanApi";
import type { PlaceAt, PlacedHouseholdItem } from "./FloorplanViewer";
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

function useItemsCatalog() {
  const [value, setValue] = useState<Load<{ items: HouseholdItem[]; categories: ItemCategory[] }>>({ state: "loading" });
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/hq/items", { cache: "no-store" }),
      fetch("/api/hq/items/categories", { cache: "no-store" }),
    ])
      .then(async ([iRes, cRes]) => {
        if (!iRes.ok || !cRes.ok) throw new Error("items");
        const iJson = (await iRes.json()) as { items?: HouseholdItem[] };
        const cJson = (await cRes.json()) as { categories?: ItemCategory[] };
        if (alive) setValue({ state: "ready", data: { items: iJson.items ?? [], categories: cJson.categories ?? [] } });
      })
      .catch(() => { if (alive) setValue({ state: "error" }); });
    return () => { alive = false; };
  }, []);
  return value;
}

function placeFromItem(item: HouseholdItem, at: PlaceAt, list: PlacedHouseholdItem[]): PlacedHouseholdItem {
  return {
    key: `${item.id}-${list.length + 1}-${Date.now()}`,
    roomId: at.roomId,
    url: item.modelUrl,
    name: item.name,
    x: at.x, z: at.z, y: at.y,
    widthM: item.widthM ?? 0.5,
    depthM: item.depthM ?? 0.5,
    heightM: item.heightM ?? 0.4,
    support: at.support,
  };
}

export function ExperienceTab() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const cats = useCatList().value;
  const houses = useHouses();
  const catalog = useItemsCatalog();
  const [room, setRoom] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string>("");
  const [placeMode, setPlaceMode] = useState(false);
  const [placed, setPlaced] = useState<PlacedHouseholdItem[]>([]);

  // 只列出有確認貼圖的貓、有讀圖完成房間的喵戶
  const catOptions = useMemo(() => (cats.state === "ready" ? cats.data.filter(c => catLook(c)) : []), [cats]);
  const houseOptions = useMemo(() => (houses.state === "ready" ? houses.data.filter(h => h.rooms.some(r => r.status === "ready")) : []), [houses]);
  const itemOptions = useMemo(() => (catalog.state === "ready" ? catalog.data.items : []), [catalog]);
  const categories = useMemo(() => (catalog.state === "ready" ? catalog.data.categories : []), [catalog]);
  const catId = catOptions.some(c => c.id === params.get("cat")) ? params.get("cat") : catOptions[0]?.id ?? null;
  const houseId = houseOptions.some(h => h.id === params.get("house")) ? params.get("house") : houseOptions[0]?.id ?? null;
  const house = useHouse(houseId);
  const cat = catOptions.find(c => c.id === catId) ?? null;
  const look = cat ? catLook(cat) : null;
  const selectedItem = itemOptions.find(i => i.id === itemId) ?? null;

  useEffect(() => {
    if (!itemId && itemOptions[0]) setItemId(itemOptions[0].id);
  }, [itemId, itemOptions]);

  useEffect(() => { setPlaced([]); setPlaceMode(false); }, [houseId]);

  const choose = (key: "cat" | "house", value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", "experience");
    next.set(key, value);
    if (key === "house") setRoom(null);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const place = (at: PlaceAt) => {
    if (!selectedItem) return;
    setPlaced(list => [...list, placeFromItem(selectedItem, at, list)]);
  };

  const dropItem = (id: string, at: PlaceAt) => {
    const item = itemOptions.find(i => i.id === id);
    if (!item) return;
    setItemId(id);
    setPlaceMode(true);
    setPlaced(list => [...list, placeFromItem(item, at, list)]);
  };

  const moveItem = (key: string, at: { x: number; z: number; y: number; support: PlacedHouseholdItem["support"] }) => {
    setPlaced(list => list.map(it => (it.key === key ? { ...it, x: at.x, z: at.z, y: at.y, support: at.support ?? null } : it)));
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
                  <div className="hq-row" style={{ gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                    <button type="button" className="hq-btn ghost" aria-pressed={!placeMode} onClick={() => setPlaceMode(false)}>叫貓走路</button>
                    <button type="button" className="hq-btn ghost" aria-pressed={placeMode} disabled={!selectedItem}
                      onClick={() => setPlaceMode(true)}>放置生活用品</button>
                    {placed.length > 0 && <button type="button" className="hq-btn ghost" onClick={() => setPlaced([])}>清空用品</button>}
                  </div>
                  <p className="hq-hint">
                    {placeMode
                      ? `放置模式：把右側「${selectedItem?.name ?? "用品"}」拖進房間，或點地板／書桌桌面放置；鍵盤、杯子、花瓶、筆記本等小物可放在桌上。`
                      : "點地板叫貓走；點床、沙發、桌子會跳上去。右側用品直接拖進房間最直覺。"}
                  </p>
                  <div className="hq-exp-stage">
                    <FloorplanViewer key={`${houseId}:${cat?.id}`} rooms={house.data.rooms} selected={room} onPick={setRoom}
                      cat={look} placedItems={placed} placeMode={placeMode} onPlace={place}
                      onMoveItem={moveItem} onFloorDrop={dropItem} />
                    {catalog.state === "loading" ? <HqSkeleton rows={3} />
                      : catalog.state === "error" ? <p className="hq-hint" role="alert">生活用品選單載入失敗。</p>
                        : (
                          <ExperienceItemPalette
                            categories={categories}
                            items={itemOptions}
                            selectedId={selectedItem?.id ?? null}
                            onSelect={item => { setItemId(item.id); setPlaceMode(true); }}
                          />
                        )}
                  </div>
                </>
              )}
      </section>
    </>
  );
}
