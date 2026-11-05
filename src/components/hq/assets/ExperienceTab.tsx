"use client";
// 虛擬體驗（#150，Tina 2026-11-03）：選一隻虛擬貓、選一戶喵戶，把貓放進那戶的 3D 室內空間。之後做互動遊戲的基礎。
// 貓＝共用母體 base_clips.glb＋這隻貓已確認的貼圖（同貓咪頁，catLook.ts）；房間＝平面圖轉換讀圖完成的房間。
// 選擇寫進網址（?tab=experience&cat=&house=），複製連結給其他管理員看到同一個畫面。
// 生活用品（#197）：右側選單類別篩選＋小圖示，只能拖進房間放置；已放用品可拖移，上方 × 可刪除。點地板只叫貓走。
// 讀圖家具：手掌模式可拖移／承載／右轉、× 移除（session；換喵戶／重整會回來）。
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { HouseholdItem, ItemCategory } from "@/lib/hq/items/types";
import {
  expandRemovedIndices, followFurnitureIndices, furnitureKey, movesByRoom, normalizeMove,
  parseFurnitureKey, resolveFurniturePose, type FurnitureMove,
} from "@/lib/hq/floorplans/experience-furniture";
import { boxToSolid, clampFurniturePose, rotatedHalfExtents } from "@/lib/hq/floorplans/experience-physics";
import { houseScene } from "@/lib/hq/floorplans/scene";
import type { FloorplanHouse, FloorplanSummary, PlanRoom, Point } from "@/lib/hq/floorplans/types";
import { HqLoadError, HqSkeleton } from "../HqStates";
import { catLook } from "./catLook";
import { ExperienceItemPalette } from "./ExperienceItemPalette";
import { FLOORPLAN_API } from "./floorplanApi";
import type { InteractMode, PlaceAt, PlacedHouseholdItem } from "./FloorplanViewer";
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

function roomShift(walls: PlanRoom["walls"]): Point {
  if (!walls?.length) return [0, 0];
  const xs = walls.flatMap(w => [w.a[0], w.b[0]]);
  const ys = walls.flatMap(w => [w.a[1], w.b[1]]);
  return [Math.min(...xs), Math.min(...ys)];
}

function roomSize(walls: PlanRoom["walls"]): [number, number] {
  if (!walls?.length) return [12, 12];
  const xs = walls.flatMap(w => [w.a[0], w.b[0]]);
  const ys = walls.flatMap(w => [w.a[1], w.b[1]]);
  const shift = roomShift(walls);
  return [Math.max(...xs) - shift[0], Math.max(...ys) - shift[1]];
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
  const [interactMode, setInteractMode] = useState<InteractMode>("point");
  const [placed, setPlaced] = useState<PlacedHouseholdItem[]>([]);
  const [removedFurniture, setRemovedFurniture] = useState<string[]>([]);
  const [furnitureMoves, setFurnitureMoves] = useState<Record<string, FurnitureMove>>({});

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
  const furnitureDirty = removedFurniture.length > 0 || Object.keys(furnitureMoves).length > 0;

  useEffect(() => {
    if (!itemId && itemOptions[0]) setItemId(itemOptions[0].id);
  }, [itemId, itemOptions]);

  useEffect(() => { setPlaced([]); setRemovedFurniture([]); setFurnitureMoves({}); setInteractMode("point"); }, [houseId]);

  const choose = (key: "cat" | "house", value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", "experience");
    next.set(key, value);
    if (key === "house") setRoom(null);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const dropItem = (id: string, at: PlaceAt) => {
    const item = itemOptions.find(i => i.id === id);
    if (!item) return;
    setItemId(id);
    setPlaced(list => [...list, placeFromItem(item, at, list)]);
  };

  const moveItem = (key: string, at: { x: number; z: number; y: number; support: PlacedHouseholdItem["support"] }) => {
    setPlaced(list => list.map(it => (it.key === key ? { ...it, x: at.x, z: at.z, y: at.y, support: at.support ?? null } : it)));
  };

  const removeItem = (key: string) => {
    setPlaced(list => list.filter(it => it.key !== key));
  };

  const removeFurniture = (roomId: string, furnitureIndex: number) => {
    const key = furnitureKey(roomId, furnitureIndex);
    setRemovedFurniture(list => (list.includes(key) ? list : [...list, key]));
    setFurnitureMoves(m => {
      if (!(key in m)) return m;
      const next = { ...m };
      delete next[key];
      return next;
    });
    // 壓在這件或連動移除的子家具上的生活用品改落地
    const roomFurniture = house?.state === "ready"
      ? house.data.rooms.find(r => r.id === roomId)?.furniture ?? []
      : [];
    const dropIdx = expandRemovedIndices(roomFurniture, new Set([furnitureIndex]));
    setPlaced(list => list.map(it => {
      if (it.roomId !== roomId || !it.support || !dropIdx.has(it.support.furnitureIndex)) return it;
      return { ...it, y: 0, support: null };
    }));
  };

  const moveFurniture = (roomId: string, furnitureIndex: number, next: FurnitureMove, prev: FurnitureMove) => {
    const room = house?.state === "ready" ? house.data.rooms.find(r => r.id === roomId) : undefined;
    const roomFurniture = room?.furniture ?? [];
    const f = roomFurniture[furnitureIndex];
    const pose = normalizeMove(next, f?.rot ?? prev.rot ?? 0);
    const dx = pose.x - prev.x;
    const dz = pose.z - prev.z;
    const key = furnitureKey(roomId, furnitureIndex);
    const prevMap = movesByRoom(furnitureMoves).get(roomId);

    setFurnitureMoves(m => {
      const out: Record<string, FurnitureMove> = { ...m, [key]: pose };
      if (dx === 0 && dz === 0) return out;
      for (const [k, p] of Object.entries(m)) {
        if (k === key) continue;
        const parsed = parseFurnitureKey(k);
        if (parsed?.roomId !== roomId || p.support?.furnitureIndex !== furnitureIndex) continue;
        out[k] = normalizeMove({ ...p, x: p.x + dx, z: p.z + dz }, p.rot);
      }
      return out;
    });

    if (dx === 0 && dz === 0) return;
    const follow = followFurnitureIndices(roomFurniture, furnitureIndex, prevMap);
    const shifted = new Set(follow);
    for (const [k, p] of Object.entries(furnitureMoves)) {
      const parsed = parseFurnitureKey(k);
      if (parsed?.roomId === roomId && p.support?.furnitureIndex === furnitureIndex) shifted.add(parsed.index);
    }
    setPlaced(list => list.map(it => {
      if (it.roomId !== roomId || !it.support || !shifted.has(it.support.furnitureIndex)) return it;
      return { ...it, x: it.x + dx, z: it.z + dz };
    }));
  };

  const rotateFurniture = (roomId: string, furnitureIndex: number) => {
    const room = house?.state === "ready" ? house.data.rooms.find(r => r.id === roomId) : undefined;
    const furniture = room?.furniture ?? [];
    const f = furniture[furnitureIndex];
    if (!f) return;
    const shift = roomShift(room?.walls);
    const moveMap = movesByRoom(furnitureMoves).get(roomId);
    const cur = resolveFurniturePose(furniture, furnitureIndex, shift, moveMap);
    const nextRot = (cur.rot + 90) % 360;
    let support = moveMap?.get(furnitureIndex)?.support ?? null;
    if (!moveMap?.has(furnitureIndex) && typeof f.parent === "number" && furniture[f.parent]) {
      const parent = resolveFurniturePose(furniture, f.parent, shift, moveMap);
      support = { furnitureIndex: f.parent, localX: cur.x - parent.x, localZ: cur.z - parent.z };
    }
    const half = rotatedHalfExtents(f.w, f.d, nextRot);
    const exclude = expandRemovedIndices(furniture, new Set([furnitureIndex]));
    const onSupport = cur.elev > 0.08 || !!support;
    const scene = room ? houseScene([room], removedFurniture, furnitureMoves).find(s => s.id === roomId) : undefined;
    const wallObs = (scene?.boxes ?? []).filter(b => b.kind === "wall" || b.kind === "sill").map(boxToSolid);
    const furnitureObs = onSupport ? [] : furniture.flatMap((other, i) => {
      if (exclude.has(i)) return [];
      const pose = resolveFurniturePose(furniture, i, shift, moveMap);
      if (pose.elev > 0.08) return [];
      const h = rotatedHalfExtents(other.w, other.d, pose.rot);
      return [{ x: pose.x, z: pose.z, hx: h.hx, hz: h.hz }];
    });
    const clamped = clampFurniturePose(
      { x: cur.x, z: cur.z }, half, scene?.size ?? roomSize(room?.walls),
      [...wallObs, ...furnitureObs],
      { inset: 0.02 },
    );
    moveFurniture(
      roomId, furnitureIndex,
      normalizeMove({ x: clamped.x, z: clamped.z, rot: nextRot, support }),
      normalizeMove({ x: cur.x, z: cur.z, rot: cur.rot, support }),
    );
  };

  const restoreFurniture = () => {
    setRemovedFurniture([]);
    setFurnitureMoves({});
    // 仍壓在家具上的用品：依讀圖原位重算座標（已被移除改落地的維持落地）
    if (house?.state !== "ready") return;
    const rooms = house.data.rooms;
    setPlaced(list => list.map(it => {
      if (!it.support) return it;
      const room = rooms.find(r => r.id === it.roomId);
      const furniture = room?.furniture;
      if (!furniture?.length) return it;
      const f = furniture[it.support.furnitureIndex];
      if (!f) return it;
      const pose = resolveFurniturePose(furniture, it.support.furnitureIndex, roomShift(room?.walls));
      return { ...it, x: pose.x + it.support.localX, z: pose.z + it.support.localZ, y: pose.elev + f.h };
    }));
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
                  <div className="hq-row" style={{ gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem", alignItems: "center" }} role="group" aria-label="互動模式">
                    <button type="button" className={`hq-btn ghost hq-exp-mode${interactMode === "point" ? " on" : ""}`}
                      aria-label="點" aria-pressed={interactMode === "point"} onClick={() => setInteractMode("point")}
                      title="點地板叫貓走，點床／沙發跳上去">
                      <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M4 3.2 19.2 12l-6.4 1.5L10.2 21.5 4 3.2Z" />
                      </svg>
                    </button>
                    <button type="button" className={`hq-btn ghost hq-exp-mode${interactMode === "hand" ? " on" : ""}`}
                      aria-label="手掌" aria-pressed={interactMode === "hand"} onClick={() => setInteractMode("hand")}
                      title="拖移用品與家具、承載拆合、右轉、移除">
                      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11" />
                        <path d="M11 10.5V5.5a1.5 1.5 0 0 1 3 0V11" />
                        <path d="M14 10.5V6.8a1.5 1.5 0 0 1 3 0V12" />
                        <path d="M17 11.5v-.7a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-5.3-3.2L5.2 12A1.8 1.8 0 0 1 8 9.7" />
                      </svg>
                    </button>
                    {placed.length > 0 && <button type="button" className="hq-btn ghost" onClick={() => setPlaced([])}>清空用品</button>}
                    {furnitureDirty && (
                      <button type="button" className="hq-btn ghost" onClick={restoreFurniture}>還原家具</button>
                    )}
                  </div>
                  <p className="hq-hint">
                    {interactMode === "point"
                      ? "點模式：點地板叫貓走；點床、沙發、桌子會跳上去。右側用品仍可拖進房間放置。"
                      : "手掌模式：拖家具（不穿牆）；桌上物可拆到地板或其他家具；↻ 右轉 90°；× 暫時移除。"}
                  </p>
                  <div className="hq-exp-stage">
                    <FloorplanViewer key={`${houseId}:${cat?.id}`} rooms={house.data.rooms} selected={room} onPick={setRoom}
                      cat={look} placedItems={placed} interactMode={interactMode}
                      removedFurniture={removedFurniture} furnitureMoves={furnitureMoves}
                      onMoveItem={moveItem} onRemoveItem={removeItem}
                      onRemoveFurniture={removeFurniture} onMoveFurniture={moveFurniture}
                      onRotateFurniture={rotateFurniture}
                      onFloorDrop={dropItem} />
                    {catalog.state === "loading" ? <HqSkeleton rows={3} />
                      : catalog.state === "error" ? <p className="hq-hint" role="alert">生活用品選單載入失敗。</p>
                        : (
                          <ExperienceItemPalette
                            categories={categories}
                            items={itemOptions}
                            selectedId={selectedItem?.id ?? null}
                            onSelect={item => setItemId(item.id)}
                          />
                        )}
                  </div>
                </>
              )}
      </section>
    </>
  );
}
