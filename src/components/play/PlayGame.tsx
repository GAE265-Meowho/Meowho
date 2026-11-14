"use client";
// 虛擬飼養 DEMO（#237）：/cats/[id]/play 的整個流程。貓咪（名字、花色、年紀、3D 貼圖）、喵戶背景、每月預算、我的 3D 房間、環境報告
// 都讀登入者的真實資料（usePlayData.ts）；沒登入或沒有喵戶先帶去登入／建立喵戶（同領養任務頁）。流程狀態在 src/lib/play/flow.ts（純函式）。
// 背景（喵戶、預算、3D 房間）→ 預算與採買 → 擺用品 → 三個節點（照 catgame 原版劇情：台詞＋選項 → 3D 貓動作 → 小遊戲 → 小叮嚀 → 紀錄）→ 試養報告。
// 進行中、續玩、放棄（#354，docs/play-tasks/7-進行中續玩放棄重玩.md）：按「下一步：預算與採買」就建一筆進行中的紀錄（meow_start_play_run），
// 每過一個節點把快照存進 meow_task_runs.progress（lib/play/save.ts），離開後從貓咪頁、全站「回任務」按鈕回來，從那個節點的開頭接著玩（可換裝置）。
// 開始前的檢查在 lib/play/run-gate.ts：沒有 3D 房間或安全報告不能開始、不再用示範房間當備案；示範貓、沒連資料庫照舊直接玩、不建紀錄。
// 外部依賴的備案（只剩示範模式用）：喵戶資料欄位缺漏＝範例值；AI 失敗＝規則；遠端 GLB 失敗＝同尺寸方塊。
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAuth } from "@/components/Auth";
import { useHouseholdGate } from "@/components/useHouseholdGate";
import type { PlaceAt, PlacedHouseholdItem, RoomClick } from "@/components/hq/assets/FloorplanViewer";
import { setItemDragData } from "@/components/hq/assets/itemDrag";
import CatButton from "@/components/ui/CatButton";
import { houseScene } from "@/lib/hq/floorplans/scene";
import { homeSceneBase } from "@/lib/home-room";
import { playGate, runErrorText, type Gate } from "@/lib/play/run-gate";
import { buildProgress, parseSaved } from "@/lib/play/save";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { SAMPLE_HOME } from "@/lib/play/background";
import { catKicker } from "@/lib/play/player-data";
import { nodeLabel } from "@/lib/play/timeline";
import { catBubble } from "@/lib/play/needs";
import { StatusMeters } from "./StatusMeters";
import type { PlayCatSource } from "@/lib/play/source";
import { clampShop, defaultShop, money, playFoods, shopCost, type PlayShop, type ShopPick } from "@/lib/play/costs";
import { playShop, type PlayCatalogItem } from "@/lib/play/catalog";
import { initialPlay, playReducer, type PlayAction } from "@/lib/play/flow";
import { homeWord } from "@/lib/play/furniture";
import { ruleHazards, type Hazard } from "@/lib/play/hazards";
import { resolvePlayItems, resolvePlayToy, type PlayItem } from "@/lib/play/items";
import { nearLabel, type SceneItem } from "@/lib/play/scene-items";
import { LINES_TIMEOUT_MS, ruleLines, type Line } from "@/lib/play/lines";
import { DEMO_DOLLHOUSE, inventoryFromPlan, inventoryFromScan, pickScanBase, type RoomInventory, type RoomKind } from "@/lib/play/room";
import { goalFor, itemSpots, type CatAction } from "@/lib/play/stage";
import { STORY, type CatPose, type NodeId } from "@/lib/play/story";
import { CARE_ACTS, careGood, type CareAct } from "@/lib/play/care";
import { CatgameMini } from "./catgame/CatgameMini";
import type { MiniCtx } from "./catgame/minis";
import { CareBar, HomeStep } from "./HomeStep";
import { NodeStep } from "./NodeStep";
import { SoundToggle, usePlayBgm } from "./PlayAudio";
import { PlayStage } from "./PlayStage";
import { ScanWand } from "./ScanWand";
import { ReportStep } from "./ReportStep";
import { AbandonPanel } from "./AbandonPanel";
import e from "./play-entry.module.css";
import { RunGateCard } from "./RunGateCard";
import { notifyRunChanged, useActiveRun, useRunProgress } from "./useActiveRun";
import { ShopStep } from "./ShopStep";
import { useHouseholdExtras, usePlayHouseholds, useRunReportId } from "./usePlayData";
import { HazardDialog } from "./HazardDialog";
import { canShowHazard, hazardReportTarget, loadReportHazard, year5HazardMoment, type ReportHazardItem } from "@/lib/play/year5-hazard";
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
  const { loading: authLoading, user } = useAuth();
  const { hasHome, pass, toGuide } = useHouseholdGate();
  const households = usePlayHouseholds();
  const [hhId, setHhId] = useState<string | null>(null);
  const hh = households?.find(h => h.id === hhId) ?? households?.[0] ?? null;
  const extras = useHouseholdExtras(hh?.id ?? null);
  // 進行中的領養任務：runId＝這一輪的紀錄（開始後或續玩讀回來才有）；示範貓、沒連資料庫不建紀錄
  const active = useActiveRun();
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  /** 續玩時用開始那一刻定格的房間（玩到一半重新上傳影片，這一輪還是用原本的） */
  const [frozenRoom, setFrozenRoom] = useState<{ id: string; base: string } | null>(null);
  const isDemo = cat.demo || !getBrowserSupabase();
  // 一般飼主喵戶的背景；登入了但只有中途／機構喵戶時用範例背景；還在讀＝null
  const guestHome = Boolean(!hh && households && user && hasHome === true);
  const home = useMemo(() => (hh ? (extras ? hh.home : null) : guestHome ? { ...SAMPLE_HOME } : null), [hh, extras, guestHome]);
  // 我的 3D 房間：undefined＝還在讀，null＝還沒建好（改用公開示範房間，見 pickScanBase）
  const myBase = frozenRoom ? frozenRoom.base : hh ? (extras ? extras.room?.base ?? null : undefined) : households ? null : undefined;
  // 沒登入、沒有喵戶：帶去登入或建立喵戶，回來接著玩
  const here = `/cats/${cat.catId}/play`;
  useEffect(() => { if (!authLoading && households && !households.length && hasHome !== true) pass(here); }, [authLoading, households, hasHome, pass, here]);
  const gate: Gate = playGate({
    demo: isDemo, authLoading, signedIn: Boolean(user), catAdoptable: cat.adoptable,
    personalHouseholds: households?.length, hasAnyHousehold: hasHome,
    active: active === undefined ? undefined : active && { runId: active.runId, catId: active.catId, catName: active.catName },
    thisCatId: cat.catId,
    room: hh ? (extras ? extras.roomState : "loading") : "none",
    report: hh ? (extras ? extras.reportState : "loading") : "none",
  });
  // 續玩：讀回進度、定格的房間與喵戶，從快照的節點開頭重新開始
  const resumeId = !runId && gate.kind === "resume" ? gate.runId : null;
  const resumed = useRunProgress(resumeId);
  const hydrated = useRef(false);
  const backShop = usePlayShop();
  const playItems = useMemo(() => resolvePlayItems(backShop), [backShop]);
  const playItem = useCallback((id: PlayItem["id"]) => playItems.find(i => i.id === id)!, [playItems]);
  const scanBase = pickScanBase(myBase, SCAN_BASE) ?? null;
  const [room, setRoom] = useState<RoomState | null>(null);
  const hazardsAsked = useRef(false);
  const roomLoading = useRef(false);
  const [pick, setPick] = useState<ShopPick>(defaultShop);
  const [placed, setPlaced] = useState<PlacedHouseholdItem[]>([]);
  const [placing, setPlacing] = useState<PlayItem["id"]>("carrier");
  /** 掃描房間：RoomViewer 不能放模型，先記下選的位置（家具名稱） */
  const [scanSpots, setScanSpots] = useState<Partial<Record<PlayItem["id"], string>>>({});
  const [lines, setLines] = useState<Partial<Record<NodeId, Line[]>>>({});
  const top = useRef<HTMLHeadingElement>(null);
  /** 在家的時光：正在玩哪一個動作的小遊戲 */
  const [careAct, setCareAct] = useState<CareAct | null>(null);
  // 這個節點裡餵過貓、換過水幾次：每做完一次貓就走到碗邊一次；換節點歸零
  const [served, setServed] = useState<{ act: "feed" | "water"; n: number } | null>(null);
  useEffect(() => { setServed(null); }, [state.nodeIndex]);
  /** 手機：把下方的劇情卡收起來，看整個 3D 房間 */
  const [peek, setPeek] = useState(false);

  const catName = cat.name;
  // 這隻貓到家時的月齡：有生日／估計月齡用真實的，沒填用劇本原本的 2 個月；體型 12 個月以下用幼貓、以上用成貓
  const startMonths = cat.months ?? 2;
  const catTraits = useMemo(() => ({ coat: cat.coat, sex: cat.sex, neutered: cat.neutered }), [cat.coat, cat.sex, cat.neutered]);
  const bodyAt = (months: number): "kitten" | "adult" => (months < 12 ? "kitten" : "adult");
  const labels = useMemo(() => room?.inventory.labels ?? [], [room]);
  const places = useMemo(() => ({ hide: homeWord("躲藏處", labels) ?? "角落", high: homeWord("高處", labels) ?? "", sofa: "沙發" }), [labels]);
  const node = STORY[state.nodeIndex];
  const cur = state.cur;
  // 五年後意外回到家、小叮嚀那一刻跳一次居家危險彈窗（year5-hazard.ts）：只讀這一輪定格的報告，有真實裁切照才跳
  const [hazardOpen, setHazardOpen] = useState(false);
  const [hazardItem, setHazardItem] = useState<ReportHazardItem | null>(null);
  const hazardShown = useRef(false);
  const runReportId = useRunReportId(runId);
  const hazardTarget = hazardReportTarget({ demo: isDemo, signedIn: Boolean(user), householdId: hh?.id ?? null, runReportId });
  const hazardHh = hazardTarget?.householdId ?? null, hazardRp = hazardTarget?.reportId ?? null;
  const inYear5 = state.step === "node" && node.id === "year5";
  const riskKey = state.life.risk?.key ?? null;
  useEffect(() => {
    if (!inYear5 || !hazardHh || !hazardRp || !riskKey) return;
    const ctrl = new AbortController();
    loadReportHazard(hazardHh, hazardRp, riskKey, fetch, ctrl.signal).then(v => { if (!ctrl.signal.aborted) setHazardItem(v); });
    return () => ctrl.abort();
  }, [inYear5, hazardHh, hazardRp, riskKey]);
  const hazardNow = year5HazardMoment({ step: state.step, nodeId: state.step === "node" ? node.id : null, cur: cur?.kind === "lines" ? { kind: "lines", lines: cur.lines } : cur, sceneBg: state.scene.bg, events: state.life.events, risk: state.life.risk });
  useEffect(() => { if (hazardNow && canShowHazard(hazardItem) && hazardItem.key === riskKey && !hazardShown.current) { hazardShown.current = true; setHazardOpen(true); } }, [hazardNow, hazardItem, riskKey]);
  const shop = shopCost(pick, "kitten", backShop);
  useEffect(() => { setPick(p => clampShop(p, backShop)); }, [backShop]);
  const shopMissing = [...(pick.budget ? [] : ["每月預算"]), ...shop.missing];

  // 每月預算：建喵戶時填的，自動帶進採買步驟（還是可以改）
  const budgetFor = useRef<string | null>(null);
  useEffect(() => {
    if (!hh || !extras || budgetFor.current === hh.id) return;
    budgetFor.current = hh.id;
    const b = extras.budget;
    if (b) setPick(p => (p.budget ? p : { ...p, budget: b }));
  }, [hh, extras]);
  // 換喵戶：房間與危險清單重讀
  const lastHh = useRef<string | null>(null);
  useEffect(() => {
    const id = hh?.id ?? null;
    if (lastHh.current && lastHh.current !== id) { setRoom(null); roomLoading.current = false; hazardsAsked.current = false; dispatch({ type: "setHazards", hazards: [] }); }
    lastHh.current = id;
  }, [hh]);

  // 換步驟時回到頁首（手機上一屏放不下）
  useEffect(() => { top.current?.scrollIntoView({ block: "start", behavior: "auto" }); }, [state.step, state.nodeIndex]);

  // 空間直接從背景資料抓（自己的房間，沒有就用公開示範房間；讀不到用範例娃娃屋），不用上傳
  useEffect(() => {
    if (room || roomLoading.current || !home || myBase === undefined || (resumeId && !hydrated.current)) return;
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
  }, [room, home, myBase, scanBase, resumeId]);

  // 居家危險：沒有關卡了，房間讀到後在背景請 AI 看物品清單（失敗用規則對照），只給故事事件用（節點 5）
  useEffect(() => {
    if (!room || state.hazards.length || hazardsAsked.current || (hh && !extras)) return;
    hazardsAsked.current = true;
    // 有環境報告（影片檢測的真實結果）就直接用；沒有才由物品清單請 AI／規則算
    if (extras?.hazards) { dispatch({ type: "setHazards", hazards: extras.hazards }); return; }
    const body = { labels: room.inventory.labels.slice(0, 40).map(l => l.slice(0, 20)), hasWindow: room.inventory.hasWindow };
    const set = (hazards: Hazard[]) => dispatch({ type: "setHazards", hazards });
    set(ruleHazards(body));
    fetch("/api/play/hazards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { hazards?: Hazard[] }) => { if (j.hazards?.length) set(j.hazards); })
      .catch(() => { /* 已經有規則備案 */ });
  }, [room, state.hazards.length, hh, extras, dispatch]);

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
  // 餵貓、換水是彈窗裡的特寫：彈窗關掉（做完）之後貓才走到碗邊；吃、喝的動作由第 4 份做，先走過去
  const careAction: CatAction | null = careAct === "scoop" ? "litter" : careAct === "play" ? "explore" : !careAct && served ? (served.act === "water" ? "drink" : "eat") : null;
  const action: CatAction | null = state.step !== "node" ? "idle"
    : careAction ? careAction
    : miniId === "scoop" ? "litter" : POSE_ACTION[state.scene.cat];
  const sceneKey = state.step === "node" ? `${state.nodeIndex}:${state.scene.bg}:${state.scene.time}:${state.scene.cat}:${miniId}:${careAct}:${served?.n}` : state.step;
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
  const playMini = state.step === "node" && cur?.kind === "mini" && cur.mini === "play";
  // 示範娃娃屋沒有 3D 逗貓：劇情裡的逗貓直接略過
  useEffect(() => { if (playMini && kind !== "scan") dispatch({ type: "miniDone", result: {} }); }, [playMini, kind]);
  const scanWand = kind === "scan" && state.step === "node" && (careAct === "play" || playMini);
  const [catches, setCatches] = useState(0);
  const toy = useMemo(() => ({ id: "toy", near: null, ...resolvePlayToy(backShop) }), [backShop]);
  const wand = useMemo(() => (scanWand ? { toy, onCatch: (c: boolean) => { if (c) setCatches(n => n + 1); } } : null), [scanWand, toy]);
  useEffect(() => { if (scanWand) setCatches(0); }, [scanWand]);
  const clip = state.step === "node" && action === "sleep" ? "sleep" : null;
  const look = action === null ? null : cat.look(state.step === "node" || state.step === "report" ? bodyAt(state.life.age) : cat.body);

  // 續玩：進度讀回來就還原採買、擺放、喵戶、定格的房間，再回到快照那個節點的開頭
  const savedCp = useRef<unknown>(null);
  useEffect(() => {
    if (!resumeId || resumed.loading || hydrated.current) return;
    hydrated.current = true;
    const saved = parseSaved(resumed.progress);
    const hid = saved?.hhId ?? hh?.id ?? null;
    setRunId(resumeId);
    if (hid && resumed.roomId) setFrozenRoom({ id: resumed.roomId, base: homeSceneBase(hid, resumed.roomId) });
    // 開始後馬上離開、還沒存過進度：從「你的家」接著走，不另外建紀錄
    if (!saved) return;
    if (saved.hhId) setHhId(saved.hhId);
    if (saved.pick) setPick(saved.pick as ShopPick);
    setPlaced(saved.placed as PlacedHouseholdItem[]);
    setScanSpots(saved.scanSpots as Partial<Record<PlayItem["id"], string>>);
    savedCp.current = saved.cp;
    dispatch({ type: "resume", cp: saved.cp });
  }, [resumeId, resumed, hh]);

  // 每過一個節點存一次進度（連採買、擺放一起存，可以換裝置續玩）
  useEffect(() => {
    const cp = state.checkpoint;
    const sb = getBrowserSupabase();
    if (!runId || !cp || !sb || savedCp.current === cp) return;
    savedCp.current = cp;
    sb.from("meow_task_runs").update({ progress: buildProgress({ cp, pick, placed, scanSpots, hhId: hh?.id ?? null }) }).eq("id", runId)
      .then(({ error }) => setSaveErr(Boolean(error)));
  }, [runId, state.checkpoint, pick, placed, scanSpots, hh]);

  /** 「下一步：預算與採買」：建一筆進行中的紀錄（開始那一刻定格房間與安全報告），之後才進採買 */
  const begin = async () => {
    const sb = getBrowserSupabase();
    if (isDemo || !sb || !extras?.room) { dispatch({ type: "next" }); return; }
    setStarting(true); setStartErr(null);
    const { data, error } = await sb.rpc("meow_start_play_run", { p_cat_id: cat.catId, p_room_id: extras.room.id });
    setStarting(false);
    if (error || !data) { setStartErr(runErrorText(error?.message ?? "")); return; }
    setRunId(data as string);
    notifyRunChanged();
    dispatch({ type: "next" });
  };

  const startNodes = () => {
    // 原版 fullBegin：依採買記下幾件事
    const shopPicks: { t: string; good: boolean | null }[] = [];
    if (!pick.scratcher) shopPicks.push({ t: "採買時沒有買貓抓板", good: null });
    if (pick.dryId && !pick.wetId) shopPicks.push({ t: "只準備了乾糧，貓喝水可能不夠", good: null });
    if (pick.fund) shopPicks.push({ t: "每月存醫療預備金", good: true });
    // 外出籠是中途送的，一定要擺、不計花費
    dispatch({ type: "startNodes", catName, labels, once: shop.once, monthly: shop.month, shopPicks, startMonths, cat: catTraits, mood: cat.mood }); 
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
      const qp: ShopPick = { ...defaultShop(), dryId: foods.find(f => f.product.category === "dry")?.product.id ?? null, wetId: foods.find(f => f.product.category === "wet")?.product.id ?? null,
        budget: extras?.budget ?? 5000 };
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
      dispatch({ type: "setHazards", hazards: ruleHazards({ labels: lab.slice(0, 40), hasWindow: r.inventory.hasWindow }) });
      dispatch({ type: "startNodes", catName, labels: lab, once: qs.once, monthly: qs.month, shopPicks: [], startMonths, cat: catTraits, mood: cat.mood });
    })();
  }, [home, room, state.step, backShop, playItems, extras, catName, startMonths, catTraits, cat.mood]);

  const miniCtx: MiniCtx = {
    age: state.life.age,
    touchFav: cat.touchFav,
    // 刷牙訓練階段：每做一次升一階（原版從「碰碰嘴邊」開始，最後到牙刷全口）
    brushLevel: Math.min(4, state.life.care.log.brush ?? 0),
    cat: { body: 5, trust: state.life.trust, stress: state.life.stress, tabby: cat.tabby },
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

  // 第 3 天：砂盆和碗「放在一起／分開」是真的搬東西——放一起就自動搬到碗旁，分開就請玩家重選一個位置
  const bowlSpot = scanSpots.bowl ?? null;
  const apartSpots = useMemo(() => {
    if (kind === "scan") return spotList.filter(p => p.label !== bowlSpot && p.label !== scanSpots.litter_box);
    const bowl = spots.find(x => x.id === "bowl");
    return itemSpots(ROOM_SCENE, playItem("litter_box"), spots.filter(x => x.id !== "litter_box"), FURNITURE_NAMES)
      .filter(p => !bowl || Math.hypot(p.x - bowl.x, p.z - bowl.z) > 1.2).slice(0, 6);
  }, [kind, spotList, bowlSpot, scanSpots.litter_box, spots, playItem]);
  const relocateMode = state.step === "node" && cur?.kind === "relocate" ? cur.mode : null;
  useEffect(() => {
    if (relocateMode !== "together") return;
    if (kind === "scan" && bowlSpot) setScanSpots(v => ({ ...v, litter_box: bowlSpot }));
    dispatch({ type: "relocated" });
  }, [relocateMode, kind, bowlSpot]);
  const moveLitter = (p: { x: number; z: number; label: string }) => {
    if (kind === "scan") setScanSpots(v => ({ ...v, litter_box: p.label }));
    else placeAt("litter_box", { x: p.x, z: p.z, y: 0, support: null });
    dispatch({ type: "relocated" });
  };

  const stepIndex = STEP_LABELS.findIndex(([k]) => k === state.step);
  const showStage = room && (state.step === "place" || state.step === "node");
  // 擺用品、飼養時 3D 房間佔滿整個螢幕，劇情與選項變成底下的卡片
  const immersive = Boolean(showStage);
  // 貓頭頂的小對話框：劇情的情緒，或在家的時光裡牠現在最想要的
  const bubble = state.step === "node" ? catBubble({ storyBub: cur?.kind === "home" ? null : state.bub, home: cur?.kind === "home", busy: careAct !== null, done: state.homeDone, canPlay: kind === "scan" }) : null;
  // 有對話框時把鏡頭轉向貓，不然框只能貼在畫面邊緣
  const lookKey = state.step === "node" && bubble && !careAct ? `${state.nodeIndex}:${cur?.kind}:${bubble}:${state.life.care.rounds}` : null;
  const canPeek = state.step === "place" || (state.step === "node" && cur?.kind !== "mini" && !careAct);
  useEffect(() => { setPeek(false); }, [state.step, state.nodeIndex, cur]);
  // 背景音樂依步驟、節點、場景切換（第 6 份）
  usePlayBgm({ step: state.step, nodeId: state.step === "node" ? node.id : null, scene: state.scene, home: cur?.kind === "home" });

  // 開始前被擋下（沒登入、沒喵戶、有別隻貓在進行、沒有房間或報告…）：只顯示說明，不進遊戲
  const hydrating = Boolean(resumeId && !hydrated.current);
  if (!isDemo && !runId && state.step === "background" && (hydrating || (gate.kind !== "start" && gate.kind !== "resume" && gate.kind !== "demo"))) {
    const g = hydrating || gate.kind === "resume" || gate.kind === "demo" || gate.kind === "start" ? ({ kind: "loading" } as const) : gate;
    return (
      <div className={s.page}>
        <h1 className={s.title}><span>{catName}的</span><span>虛擬飼養</span></h1>
        <RunGateCard gate={g} catName={catName} catHref={catHref} householdId={households?.[0]?.id ?? null} here={here} onGuide={() => toGuide(here)} />
      </div>
    );
  }

  return (
    <div className={s.page} data-immersive={immersive ? "true" : undefined}>
      <h1 className={immersive ? s.srOnly : s.title} ref={top}><span>{catName}的</span><span>虛擬飼養</span></h1>
      {immersive ? (
        <div className={s.hud}>
          <div className={s.hudInfo}>
            <div className={s.hudRow}>
              <span className={s.hudChip}>{catName}・{STEP_LABELS[stepIndex]?.[1]}</span>
              {state.step === "node" && <span className={s.hudChip}>{nodeLabel(node, state.startMonths)}</span>}
            </div>
            {state.step === "node" && <StatusMeters trust={state.life.trust} stress={state.life.stress} />}
          </div>
          <div className={s.hudEnd}>
            <SoundToggle />
            {runId && <button type="button" className={s.exit} onClick={() => setAbandoning(true)}>放棄</button>}
            <a className={s.exit} href={catHref} onClick={ev => { if (!window.confirm(runId ? "要離開嗎？下次會從這個節點的開頭接著玩。" : "要離開虛擬飼養嗎？目前的進度不會保留。")) ev.preventDefault(); }}>離開</a>
          </div>
        </div>
      ) : (
        <div className={s.stepsRow}>
          <ol className={s.steps} aria-label="進度">
            {STEP_LABELS.map(([k, label], i) => <li key={k} aria-current={i === stepIndex ? "step" : undefined}>{label}</li>)}
          </ol>
          <SoundToggle />
          {runId && <button type="button" className={s.exit} onClick={() => setAbandoning(true)}>放棄任務</button>}
        </div>
      )}
      {saveErr && <p className={s.missing} role="status">進度沒有存到，請檢查網路；離開後可能要從上一個節點接著玩。</p>}
      {hazardOpen && state.life.risk && hazardItem && (
        <HazardDialog risk={state.life.risk} item={hazardItem} onClose={() => setHazardOpen(false)} />
      )}
      {abandoning && runId && (
        <div className={e.overlay}><AbandonPanel catName={catName} runId={runId} onCancel={() => setAbandoning(false)} onDone={() => { window.location.href = catHref; }} /></div>
      )}

      {immersive && state.step === "node" && cur?.kind === "home" && !careAct && <CareBar state={state} canPlay={kind === "scan"} onAct={setCareAct} />}

      {showStage && (
        <PlayStage kind={kind} scanBase={scanBase} look={look} bubble={bubble} bubbleInset={peek || (cur?.kind === "home" && !careAct) ? 0.08 : 0.48} lookKey={lookKey} placed={placed} scanItems={scanItems} story={story} wand={wand}
          goal={goal} clip={clip} speed={state.step === "node" ? node.speed : 1}
          onDrop={state.step === "place" && kind === "dollhouse"
            ? (id, at) => { if (playItems.some(i => i.id === id)) placeAt(id as PlayItem["id"], at); }
            : undefined}>
        </PlayStage>
      )}

      {state.step === "background" && (
        <section className={s.card} aria-labelledby="home-title">
          <span className={s.kicker}>{catKicker(cat)}</span>
          <h2 id="home-title">先看看你的家</h2>
          {!home ? <p className={s.lead}>讀取你的喵戶…</p> : (
            <>
              <p className={s.lead}>{home.sample ? "還沒登入或還沒有喵戶，先用一個範例的家來玩。" : "這些資料來自你的喵戶，劇情會依你的家改寫。"}</p>
              {(households?.length ?? 0) > 1 && (
                <div className={s.chips} role="group" aria-label="用哪個喵戶">
                  {households!.map(h => <button key={h.id} type="button" className={s.chipBtn} aria-pressed={hh?.id === h.id} onClick={() => setHhId(h.id)}>{h.name}</button>)}
                </div>
              )}
              <dl className={s.facts}>
                {hh && <div><dt>喵戶</dt><dd>{hh.name}</dd></div>}
                <div><dt>每月預算</dt><dd>{extras?.budget ? `${money(extras.budget)} 元` : "還沒填"}</dd></div>
                <div><dt>住家型態</dt><dd>{home.dwelling}</dd></div>
                <div><dt>住家狀況</dt><dd>{home.living}</dd></div>
                <div><dt>同住的人</dt><dd>{home.family.join("、") || "一個人住"}</dd></div>
                <div><dt>現有寵物</dt><dd>{home.pets.join("、") || "沒有"}</dd></div>
                <div><dt>3D 房間</dt><dd>{extras?.room ? "你家的房間" : "示範房間（還沒建立）"}</dd></div>
              </dl>
              {hh && extras && !extras.room && <div className={s.actions}><CatButton variant="ghost" href={`/homes/${hh.id}/scene?next=${encodeURIComponent(here)}`}>建立我家的 3D 房間</CatButton></div>}
              {!room ? <p className={s.lead} role="status">讀取你的空間…</p> : (
                <>
                  {startErr && <p className={s.missing} role="alert">{startErr}</p>}
                  <div className={s.actions}><CatButton disabled={starting} onClick={begin}>{starting ? "準備中…" : "下一步：預算與採買"}</CatButton></div>
                </>
              )}
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

      {immersive && <div className={s.sheet} data-peek={peek ? "true" : undefined}>
      {canPeek && <button type="button" className={s.peekBtn} aria-pressed={peek} onClick={() => setPeek(p => !p)}>{peek ? "回到劇情" : "看看房間"}</button>}
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
      {relocateMode === "apart" && (
        <section className={s.card} aria-labelledby="relocate-title">
          <h2 id="relocate-title">把貓砂盆搬到別的地方</h2>
          <p className={s.lead}>選一個離餐碗遠一點、安靜的位置：</p>
          <div className={s.chips} role="group" aria-label="貓砂盆的新位置">
            {apartSpots.map(p => <button key={p.label} type="button" className={s.chipBtn} onClick={() => moveLitter(p)}>{p.label}</button>)}
          </div>
        </section>
      )}
      {state.step === "node" && cur?.kind === "home" && !careAct && (
        <HomeStep onFinish={() => dispatch({ type: "next" })} />
      )}
      {playMini && scanWand && (
        <ScanWand key={`story:wand:${state.nodeIndex}`} catName={catName} catches={catches}
          onDone={r => dispatch({ type: "miniDone", result: r })} />
      )}
      {state.step === "node" && cur?.kind === "mini" && cur.mini !== "play" && (
        <CatgameMini key={`${state.nodeIndex}:${cur.mini}:${state.life.picks.length}`} id={cur.mini} ctx={miniCtx} catName={catName}
          // 外出籠：劇情只看成功與否（原版結果 { ok, forced, treats }）
          onDone={r => dispatch({ type: "miniDone", result: cur.mini === "carrier" ? (r as { ok?: boolean } | null)?.ok === true : r })} />
      )}
      {state.step === "node" && cur?.kind === "home" && careAct === "play" && scanWand && (
        <ScanWand key={`care:wand:${state.life.care.rounds}`} catName={catName} catches={catches}
          onDone={r => { dispatch({ type: "care", act: "play", good: careGood("play", r) }); setCareAct(null); }} />
      )}
      {state.step === "node" && cur?.kind === "home" && careAct && careAct !== "play" && (() => {
        const mini = CARE_ACTS.find(a => a.act === careAct)!.mini!;
        const done = (r: unknown) => {
          if (r === null) { setCareAct(null); return; }
          dispatch({ type: "care", act: careAct, good: careGood(careAct, r) });
          if (careAct === "feed" || careAct === "water") { const act = careAct; setServed(s => ({ act, n: (s?.n ?? 0) + 1 })); }
          setCareAct(null);
        };
        return <CatgameMini key={`care:${careAct}:${state.life.care.rounds}`} id={mini} ctx={miniCtx} catName={catName} onDone={done} />;
      })()}

      </div>}

      {state.step === "report" && home && (
        <ReportStep state={state} pick={pick} monthly={shop.month} home={home} runId={runId} catHref={catHref}
          onRestart={() => { dispatch({ type: "restart" }); hazardsAsked.current = false; hazardShown.current = false; setHazardItem(null); setPlaced([]); setScanSpots({}); setLines({}); setRunId(null); setFrozenRoom(null); savedCp.current = null; }} />
      )}
    </div>
  );
}
