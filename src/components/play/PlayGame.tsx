"use client";
// 虛擬飼養 DEMO（#237）：/cats/[id]/play 的整個流程（DEMO 固定麻糬）。流程狀態在 src/lib/play/flow.ts（純函式）。
// 背景 → 上傳房間（模擬）→ AI 辨認危險 → 預算與採買 → 擺用品 → 三個節點（照 catgame 原版劇情：台詞＋選項 → 3D 貓動作 → 小遊戲 → 小叮嚀 → 紀錄）→ 試養報告。
// 遊戲狀態只放在前端 state（不新增資料表、不寫資料庫）；重新整理會從頭開始。
// 外部依賴都有備案：沒登入／沒喵戶＝範例背景；沒有掃描房間設定＝娃娃屋；AI 失敗＝規則；遠端 GLB 失敗＝同尺寸方塊。
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAuth } from "@/components/Auth";
import type { PlaceAt, PlacedHouseholdItem, RoomClick } from "@/components/hq/assets/FloorplanViewer";
import { setItemDragData } from "@/components/hq/assets/itemDrag";
import CatButton from "@/components/ui/CatButton";
import { houseScene } from "@/lib/hq/floorplans/scene";
import { normalizeHome, SAMPLE_HOME, type PlayerHome } from "@/lib/play/background";
import type { PlayCatSource } from "@/lib/play/source";
import { emptyShop, playFoods, shopCost, type PlayShop, type ShopPick } from "@/lib/play/costs";
import { playShop, type PlayCatalogItem } from "@/lib/play/catalog";
import { initialPlay, playReducer, type PlayAction } from "@/lib/play/flow";
import { homeWord } from "@/lib/play/furniture";
import { ruleHazards, type Hazard } from "@/lib/play/hazards";
import { resolvePlayItems, resolvePlayToy, type PlayItem } from "@/lib/play/items";
import { nearLabel, type SceneItem } from "@/lib/play/scene-items";
import { LINES_TIMEOUT_MS, ruleLines, type Line } from "@/lib/play/lines";
import { DEFAULT_ROOM_ID, DEMO_DOLLHOUSE, inventoryFromPlan, inventoryFromScan, pickScanBase, type RoomInventory, type RoomKind } from "@/lib/play/room";
import { goalFor, itemSpots, type CatAction } from "@/lib/play/stage";
import { STORY, type CatPose, type NodeId } from "@/lib/play/story";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { homeSceneBase } from "@/lib/home-room";
import { CARE_ACTS, careGood, type CareAct } from "@/lib/play/care";
import { CatgameMini } from "./catgame/CatgameMini";
import type { MiniCtx, RhythmKey, ToyKey } from "./catgame/minis";
import { HomeStep } from "./HomeStep";
import { NodeStep } from "./NodeStep";
import { PlayStage } from "./PlayStage";
import { ScanWand } from "./ScanWand";
import { ReportStep } from "./ReportStep";
import { ShopStep } from "./ShopStep";
import s from "./play.module.css";

const STEP_LABELS = [["background", "你的家"], ["shop", "採買"], ["place", "擺用品"], ["node", "飼養"], ["report", "報告"]] as const;
const SCAN_BASE = process.env.NEXT_PUBLIC_ROOM_DEMO_BASE?.trim() || null;
const ROOM_SCENE = houseScene([DEMO_DOLLHOUSE])[0];
const FURNITURE_NAMES = Object.fromEntries((DEMO_DOLLHOUSE.furniture ?? []).map((f, i) => [i, f.label]));
/** 原版場景的貓姿勢 → 3D 貓的動作（none＝貓不在畫面） */
const POSE_ACTION: Record<CatPose, CatAction | null> = {
  sit: "idle", carrier: "carrier", underbed: "hide", hide: "hide", sofa: "sofa", zoom: "explore", frail: "sleep", bed: "sleep", table: "idle", none: null,
};
/** 原版 newGame：喜歡的玩具、玩的節奏開局隨機抽（玩家看不到）；DEMO 一開始只有羽毛逗貓棒 */
const pickOne = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** 讀玩家背景：登入且有一般飼主的喵戶時讀 home；其他情況用範例背景 */
function usePlayerHome(): PlayerHome | null {
  const { loading, user } = useAuth();
  const [home, setHome] = useState<PlayerHome | null>(null);
  useEffect(() => {
    if (loading) return;
    const sb = getBrowserSupabase();
    if (!sb || !user) { setHome({ ...SAMPLE_HOME }); return; }
    let alive = true;
    sb.from("meow_households").select("home").eq("owner_id", user.id).eq("caretaker_type", "cat_owner").order("created_at").limit(1)
      .then(({ data, error }) => { if (alive) setHome(error ? { ...SAMPLE_HOME } : normalizeHome(data?.[0]?.home ?? null)); });
    return () => { alive = false; };
  }, [loading, user]);
  return home;
}

/** 我的 3D 房間：登入者名下已完成的預設房間（DEFAULT_ROOM_ID，只有房間主人查得到）→ 前台房間檔 API 的資料夾網址；undefined＝還在查，null＝沒有（改用公開示範房間，見 pickScanBase） */
function useMyRoomBase(): string | null | undefined {
  const { loading, user } = useAuth();
  const [base, setBase] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (loading) return;
    const sb = getBrowserSupabase();
    if (!sb || !user) { setBase(null); return; }
    let alive = true;
    sb.from("meow_room_models").select("id,owner_household_id").eq("id", DEFAULT_ROOM_ID).eq("status", "ready").maybeSingle()
      .then(({ data }) => { if (alive) setBase(data?.owner_household_id ? homeSceneBase(data.owner_household_id, data.id) : null); });
    return () => { alive = false; };
  }, [loading, user]);
  return base;
}

/** 後台生活用品的價格、選項、模型（伺服器 API 代讀）；讀不到或後台沒有就回空，沿用程式裡寫的 */
function usePlayShop(): PlayShop {
  const [shop, setShop] = useState<PlayShop>({ flags: {}, opts: {}, models: {} });
  useEffect(() => {
    let alive = true;
    fetch("/api/play/items").then(r => (r.ok ? r.json() : null)).then((d: { items?: PlayCatalogItem[] } | null) => {
      if (alive && d?.items) setShop(playShop(d.items));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return shop;
}

interface RoomState { kind: RoomKind; inventory: RoomInventory; notice: string | null }

export function PlayGame({ cat, catHref }: { cat: PlayCatSource; catHref: string }) {
  const [state, dispatch] = useReducer((st: ReturnType<typeof initialPlay>, a: PlayAction) => playReducer(st, a), undefined, initialPlay);
  const home = usePlayerHome();
  const myBase = useMyRoomBase();
  const backShop = usePlayShop();
  const playItems = useMemo(() => resolvePlayItems(backShop), [backShop]);
  const playItem = useCallback((id: PlayItem["id"]) => playItems.find(i => i.id === id)!, [playItems]);
  const scanBase = pickScanBase(myBase, SCAN_BASE) ?? null;
  const [room, setRoom] = useState<RoomState | null>(null);
  const hazardsAsked = useRef(false);
  const [pick, setPick] = useState<ShopPick>(emptyShop);
  const taste = useRef<{ toyPref: ToyKey; rhythm: RhythmKey } | null>(null);
  const [placed, setPlaced] = useState<PlacedHouseholdItem[]>([]);
  const [placing, setPlacing] = useState<PlayItem["id"]>("carrier");
  /** 掃描房間：RoomViewer 不能放模型，先記下選的位置（家具名稱） */
  const [scanSpots, setScanSpots] = useState<Partial<Record<PlayItem["id"], string>>>({});
  const [lines, setLines] = useState<Partial<Record<NodeId, Line[]>>>({});
  const top = useRef<HTMLHeadingElement>(null);
  /** 在家的時光：正在玩哪一個動作的小遊戲 */
  const [careAct, setCareAct] = useState<CareAct | null>(null);

  const catName = cat.name;
  const labels = useMemo(() => room?.inventory.labels ?? [], [room]);
  const places = useMemo(() => ({ hide: homeWord("躲藏處", labels) ?? "角落", high: homeWord("高處", labels) ?? "", sofa: "沙發" }), [labels]);
  const node = STORY[state.nodeIndex];
  const cur = state.cur;
  const shop = shopCost(pick, "kitten", backShop);
  const shopMissing = [...(pick.budget ? [] : ["每月預算"]), ...shop.missing];

  // 換步驟時回到頁首（手機上一屏放不下）
  useEffect(() => { top.current?.scrollIntoView({ block: "start", behavior: "auto" }); }, [state.step, state.nodeIndex]);

  // 空間直接從背景資料抓（自己的房間，沒有就用公開示範房間；讀不到用範例娃娃屋），不用上傳
  const roomLoading = useRef(false);
  useEffect(() => {
    if (room || roomLoading.current || !home || myBase === undefined) return;
    roomLoading.current = true;
    const dollhouse = (): RoomState => ({ kind: "dollhouse", inventory: inventoryFromPlan(DEMO_DOLLHOUSE), notice: null });
    (async () => {
      let r = dollhouse();
      if (scanBase) {
        try {
          const res = await fetch(`${scanBase.replace(/\/$/, "")}/scene.json`);
          if (res.ok) r = { kind: "scan", inventory: inventoryFromScan(await res.json()), notice: null };
        } catch { /* 讀不到就用範例娃娃屋 */ }
      }
      setRoom(r);
    })();
  }, [room, home, myBase, scanBase]);

  // 居家危險：沒有關卡了，房間讀到後在背景請 AI 看物品清單（失敗用規則對照），只給故事事件用（節點 5）
  useEffect(() => {
    if (!room || state.hazards.length || hazardsAsked.current) return;
    hazardsAsked.current = true;
    const body = { labels: room.inventory.labels.slice(0, 40).map(l => l.slice(0, 20)), hasWindow: room.inventory.hasWindow };
    const set = (hazards: Hazard[]) => dispatch({ type: "setHazards", hazards });
    set(ruleHazards(body));
    fetch("/api/play/hazards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { hazards?: Hazard[] }) => { if (j.hazards?.length) set(j.hazards); })
      .catch(() => { /* 已經有規則備案 */ });
  }, [room, state.hazards.length, dispatch]);

  // 個人化台詞：進入節點就先請 AI 寫（約 8 秒逾時）；輪到那一段還沒回來就用規則台詞，玩家不用等
  useEffect(() => {
    if (state.step !== "node" || !home || lines[node.id]) return;
    const ctx = { nodeId: node.id, catName, home, labels: labels.slice(0, 40).map(l => l.slice(0, 20)) };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LINES_TIMEOUT_MS);
    fetch("/api/play/lines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ctx), signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { lines?: Line[] }) => { if (j.lines?.length) setLines(v => (v[node.id] ? v : { ...v, [node.id]: j.lines })); })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [state.step, node.id, home, labels, catName, lines]);
  const personal = lines[node.id] ?? (home ? ruleLines({ nodeId: node.id, catName, home, labels }) : []);

  // 3D 貓配合劇情動作（娃娃屋才有；掃描房間的貓由 RoomViewer 自己處理）
  const spots = useMemo(() => placed.map(p => ({ id: p.key.split(":")[0], x: p.x, z: p.z, widthM: p.widthM, depthM: p.depthM })), [placed]);
  // 小遊戲時：躲床底＝躲起來、鏟屎＝走到貓砂盆、陪玩＝在房間裡跑；其他照原版場景的貓姿勢
  const miniId = cur?.kind === "mini" ? cur.mini : null;
  const careAction: CatAction | null = careAct === "scoop" ? "litter" : careAct === "play" ? "explore" : careAct === "feed" ? "eat" : null;
  const action: CatAction | null = state.step !== "node" ? "idle"
    : careAction ? careAction
    : miniId === "hide" ? "hide" : miniId === "scoop" ? "litter" : miniId === "play" ? "explore" : POSE_ACTION[state.scene.cat];
  const sceneKey = state.step === "node" ? `${state.nodeIndex}:${state.scene.bg}:${state.scene.time}:${state.scene.cat}:${miniId}:${careAct}` : state.step;
  const goal = useMemo<(RoomClick & { at: number }) | null>(() => {
    if (state.step !== "node" || !action) return null;
    const g = goalFor(ROOM_SCENE, action, places, spots);
    return g && { ...g, at: Date.now() };
    // 只在場景換了才重算（sceneKey），不然貓會一直被拉回去
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey, places, spots]);
  const kind = room?.kind ?? "dollhouse";
  // 掃描房間的貓配合劇情動作（和娃娃屋的 goal 同一套 action；只在場景換了才重算）
  const story = useMemo<{ action: CatAction | null; at: number } | null>(() => (state.step === "node" ? { action, at: Date.now() } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sceneKey]);
  // 3D 逗貓（掃描房間）：在家的時光按「逗貓」或節點裡的逗貓小遊戲
  const scanWand = kind === "scan" && state.step === "node" && (careAct === "play" || miniId === "play");
  const [catches, setCatches] = useState(0);
  const toy = useMemo(() => ({ id: "toy", near: null, ...resolvePlayToy(backShop) }), [backShop]);
  const wand = useMemo(() => (scanWand ? { toy, onCatch: (c: boolean) => { if (c) setCatches(n => n + 1); } } : null), [scanWand, toy]);
  useEffect(() => { if (scanWand) setCatches(0); }, [scanWand]);
  const clip = state.step === "node" && action === "sleep" ? "sleep" : null;
  const look = action === null ? null : cat.look(state.step === "node" || state.step === "report" ? node.body : "kitten");

  const startNodes = () => {
    taste.current = { toyPref: pickOne(["feather", "mouse", "ribbon"] as const), rhythm: pickOne(["quick", "slow"] as const) };
    // 原版 fullBegin：依採買記下幾件事
    const shopPicks: { t: string; good: boolean | null }[] = [];
    if (!pick.scratcher) shopPicks.push({ t: "採買時沒有買貓抓板", good: null });
    if (pick.dryId && !pick.wetId) shopPicks.push({ t: "只準備了乾糧，貓喝水可能不夠", good: null });
    if (pick.fund) shopPicks.push({ t: "每月存醫療預備金", good: true });
    // 外出籠是中途送的，一定要擺、不計花費
    dispatch({ type: "startNodes", labels, once: shop.once, monthly: shop.month, shopPicks });
  };
  // 網址加 ?quick=1：跳過背景、採買、擺用品，直接進第 1 個節點（試玩用）。房間用背景自動讀到的空間
  const quickDone = useRef(false);
  useEffect(() => {
    if (quickDone.current || !home || !room || state.step !== "background") return;
    if (new URLSearchParams(window.location.search).get("quick") !== "1") return;
    quickDone.current = true;
    const r = room;
    (async () => {
      const lab = r.inventory.labels;
      const foods = playFoods("kitten").filter(f => f.canBuy);
      const qp: ShopPick = { ...emptyShop(), dryId: foods.find(f => f.product.category === "dry")?.product.id ?? null, wetId: foods.find(f => f.product.category === "wet")?.product.id ?? null,
        litter: 0, box: 0, bowls: 0, treat: 1, fund: 1, budget: 5000 };
      setPick(qp);
      const qs = shopCost(qp, "kitten", backShop);
      if (r.kind === "dollhouse") {
        const list: PlacedHouseholdItem[] = [];
        for (const it of playItems) {
          const sp = itemSpots(ROOM_SCENE, it, list.map(p => ({ id: p.key.split(":")[0], x: p.x, z: p.z, widthM: p.widthM, depthM: p.depthM })), FURNITURE_NAMES)[0];
          if (!sp) continue;
          list.push({ key: `${it.id}:${Date.now()}`, roomId: DEMO_DOLLHOUSE.id, url: it.url, name: it.name, x: sp.x, z: sp.z, y: 0, support: null, widthM: it.widthM, depthM: it.depthM, heightM: it.heightM });
        }
        setPlaced(list);
      } else setScanSpots(Object.fromEntries(playItems.map((it, i) => [it.id, `${lab[i] ?? "房間"}旁`])));
      taste.current = { toyPref: pickOne(["feather", "mouse", "ribbon"] as const), rhythm: pickOne(["quick", "slow"] as const) };
      dispatch({ type: "setHazards", hazards: ruleHazards({ labels: lab.slice(0, 40), hasWindow: r.inventory.hasWindow }) });
      dispatch({ type: "startNodes", labels: lab, once: qs.once, monthly: qs.month, shopPicks: [] });
    })();
  }, [home, room, state.step, backShop, playItems]);

  const miniCtx: MiniCtx = {
    age: node.age, toys: ["feather"],
    // 刷牙訓練階段：每做一次升一階（原版從「碰碰嘴邊」開始，最後到牙刷全口）
    brushLevel: Math.min(4, state.life.care.log.brush ?? 0),
    cat: { body: 5, trust: state.life.trust, stress: state.life.stress, toyPref: taste.current?.toyPref ?? "feather", rhythm: taste.current?.rhythm ?? "quick" },
  };

  const placeAt = (id: PlayItem["id"], at: { x: number; z: number; y: number; support: PlaceAt["support"] }) => {
    const item = playItem(id);
    setPlaced(list => [...list.filter(p => !p.key.startsWith(`${id}:`)), {
      key: `${id}:${Date.now()}`, roomId: DEMO_DOLLHOUSE.id, url: item.url, name: item.name,
      x: at.x, z: at.z, y: at.y, support: at.support, widthM: item.widthM, depthM: item.depthM, heightM: item.heightM,
    }]);
    const other = playItems.find(i => i.id !== id && !placed.some(p => p.key.startsWith(`${i.id}:`)));
    if (other) setPlacing(other.id);
  };
  // 掃描房間：擺用品選的位置（「床旁」「房間角落」）→ 放進 3D 房間的用品清單
  const scanItems = useMemo<SceneItem[]>(() => (kind === "scan"
    ? playItems.filter(i => scanSpots[i.id]).map(i => ({ id: i.id, url: i.url, widthM: i.widthM, depthM: i.depthM, heightM: i.heightM, near: nearLabel(scanSpots[i.id]) }))
    : []), [kind, playItems, scanSpots]);
  const placedIds = playItems.filter(i => (kind === "scan" ? scanSpots[i.id] : placed.some(p => p.key.startsWith(`${i.id}:`)))).map(i => i.id);
  const spotList = useMemo(() => {
    if (kind === "scan") return [...labels.slice(0, 6).map(l => ({ x: 0, z: 0, label: `${l}旁` })), { x: 0, z: 0, label: "房間角落" }];
    const item = playItem(placing);
    return itemSpots(ROOM_SCENE, item, spots.filter(x => x.id !== placing), FURNITURE_NAMES);
  }, [kind, labels, placing, spots, playItem]);
  const choose = (p: { x: number; z: number; label: string }) => {
    if (kind !== "scan") { placeAt(placing, { x: p.x, z: p.z, y: 0, support: null }); return; }
    setScanSpots(v => ({ ...v, [placing]: p.label }));
    const other = playItems.find(i => i.id !== placing && !scanSpots[i.id]);
    if (other) setPlacing(other.id);
  };

  const stepIndex = STEP_LABELS.findIndex(([k]) => k === state.step);
  const showStage = room && (state.step === "place" || state.step === "node");

  return (
    <div className={s.page}>
      <h1 className={s.title} ref={top}><span>{catName}的</span><span>虛擬飼養</span></h1>
      <ol className={s.steps} aria-label="進度">
        {STEP_LABELS.map(([k, label], i) => <li key={k} aria-current={i === stepIndex ? "step" : undefined}>{label}</li>)}
      </ol>

      {showStage && (
        <PlayStage kind={kind} scanBase={scanBase} look={look} placed={placed} scanItems={scanItems} story={story} wand={wand}
          tag={state.step === "node" ? node.label : undefined}
          goal={goal} clip={clip} speed={state.step === "node" ? node.speed : 1}
          onDrop={state.step === "place" && kind === "dollhouse"
            ? (id, at) => { if (playItems.some(i => i.id === id)) placeAt(id as PlayItem["id"], at); }
            : undefined}>
        </PlayStage>
      )}

      {state.step === "background" && (
        <section className={s.card} aria-labelledby="home-title">
          <span className={s.kicker}>{catName}・{cat.coat}・幼貓</span>
          <h2 id="home-title">先看看你的家</h2>
          {!home ? <p className={s.lead}>讀取你的喵戶…</p> : (
            <>
              <p className={s.lead}>{home.sample ? "還沒登入或還沒有喵戶，先用一個範例的家來玩。" : "這些資料來自你的喵戶，劇情會依你的家改寫。"}</p>
              <dl className={s.facts}>
                <div><dt>住家型態</dt><dd>{home.dwelling}</dd></div>
                <div><dt>住家狀況</dt><dd>{home.living}</dd></div>
                <div><dt>同住的人</dt><dd>{home.family.join("、") || "一個人住"}</dd></div>
                <div><dt>現有寵物</dt><dd>{home.pets.join("、") || "沒有"}</dd></div>
              </dl>
              {!room ? <p className={s.lead} role="status">讀取你的空間…</p> : <div className={s.actions}><CatButton onClick={() => dispatch({ type: "next" })}>下一步：預算與採買</CatButton></div>}
            </>
          )}
        </section>
      )}

      {state.step === "shop" && (
        <>
          <ShopStep pick={pick} shop={backShop} onChange={setPick} />
          {shopMissing.length > 0 && <p className={s.missing}>還缺：{shopMissing.join("、")}</p>}
          <div className={s.actions}>
            <CatButton disabled={shopMissing.length > 0} onClick={() => dispatch({ type: "next" })}>下一步：擺放用品</CatButton>
          </div>
        </>
      )}

      {state.step === "place" && (
        <section className={s.card} aria-labelledby="place-title">
          <h2 id="place-title">把外出籠、餐碗和貓砂盆放進房間</h2>
          {kind === "scan" && <p className={s.lead}>選好位置，用品就會放進你的房間，可以拖曳房間轉動視角看看。</p>}
          <div className={s.chips} role="group" aria-label="要放的用品">
            {playItems.map(i => (
              <button key={i.id} type="button" className={s.chipBtn} aria-pressed={placing === i.id}
                draggable onDragStart={e => setItemDragData(e.dataTransfer, i.id)}
                onClick={() => setPlacing(i.id)}>
                {i.name}{placedIds.includes(i.id) ? "（已放）" : ""}
              </button>
            ))}
          </div>
          <p className={s.lead}>選一個位置放{playItem(placing).name}{kind === "dollhouse" ? "，或用滑鼠把上面的用品拖進房間" : ""}：</p>
          <div className={s.chips} role="group" aria-label="位置">
            {spotList.map(p => (
              <button key={p.label} type="button" className={s.chipBtn}
                aria-pressed={kind === "scan" ? scanSpots[placing] === p.label : undefined}
                onClick={() => choose(p)}>{p.label}</button>
            ))}
          </div>
          {placedIds.length < playItems.length && <p className={s.missing}>還缺：{playItems.filter(i => !placedIds.includes(i.id)).map(i => i.name).join("、")}</p>}
          <div className={s.actions}>
            <CatButton disabled={placedIds.length < playItems.length} onClick={startNodes}>帶{catName}回家</CatButton>
          </div>
        </section>
      )}

      {state.step === "node" && (
        <NodeStep state={state} personal={personal}
          onNext={() => dispatch({ type: "next" })} onChoose={i => dispatch({ type: "choose", index: i })} />
      )}
      {state.step === "node" && cur?.kind === "home" && !careAct && (
        <HomeStep state={state} onAct={setCareAct} onFinish={() => dispatch({ type: "next" })} />
      )}
      {state.step === "node" && cur?.kind === "mini" && scanWand && (
        <ScanWand key={`${state.nodeIndex}:wand`} catName={catName} catches={catches} onDone={r => dispatch({ type: "miniDone", result: r })} />
      )}
      {state.step === "node" && cur?.kind === "mini" && !(scanWand && cur.mini === "play") && (
        <CatgameMini key={`${state.nodeIndex}:${cur.mini}:${state.life.picks.length}`} id={cur.mini} ctx={miniCtx}
          // 外出籠：劇情只看成功與否（原版結果 { ok, forced, treats }）
          onDone={r => dispatch({ type: "miniDone", result: cur.mini === "carrier" ? (r as { ok?: boolean } | null)?.ok === true : r })} />
      )}
      {state.step === "node" && cur?.kind === "home" && careAct === "play" && scanWand && (
        <ScanWand key={`care:wand:${state.life.care.rounds}`} catName={catName} catches={catches}
          onDone={r => { dispatch({ type: "care", act: "play", good: careGood("play", r) }); setCareAct(null); }} />
      )}
      {state.step === "node" && cur?.kind === "home" && careAct && !(careAct === "play" && scanWand) && (() => {
        const mini = CARE_ACTS.find(a => a.act === careAct)!.mini;
        const done = (r: unknown) => { dispatch({ type: "care", act: careAct, good: careGood(careAct, r) }); setCareAct(null); };
        return <CatgameMini key={`care:${careAct}:${state.life.care.rounds}`} id={mini} ctx={miniCtx} onDone={done} />;
      })()}

      {state.step === "report" && home && (
        <ReportStep state={state} pick={pick} monthly={shop.month} home={home} catHref={catHref}
          onRestart={() => { dispatch({ type: "restart" }); hazardsAsked.current = false; setPlaced([]); setScanSpots({}); setLines({}); }} />
      )}
    </div>
  );
}
