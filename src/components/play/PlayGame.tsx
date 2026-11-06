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
import { PLAY_CAT, playCatLook } from "@/lib/play/cats";
import { emptyShop, shopCost, type ShopPick } from "@/lib/play/costs";
import { initialPlay, playReducer, type PlayAction } from "@/lib/play/flow";
import { homeWord } from "@/lib/play/furniture";
import { ruleHazards, type Hazard } from "@/lib/play/hazards";
import { PLAY_ITEMS, playItem, type PlayItem } from "@/lib/play/items";
import { LINES_TIMEOUT_MS, ruleLines, type Line } from "@/lib/play/lines";
import { DEMO_DOLLHOUSE, type RoomInventory, type RoomKind } from "@/lib/play/room";
import { goalFor, itemSpots, type CatAction } from "@/lib/play/stage";
import { STORY, type CatPose, type NodeId } from "@/lib/play/story";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { CatgameMini } from "./catgame/CatgameMini";
import type { MiniCtx, RhythmKey, ToyKey } from "./catgame/minis";
import { NodeStep } from "./NodeStep";
import { PlayStage } from "./PlayStage";
import { ReportStep } from "./ReportStep";
import { RoomStep } from "./RoomStep";
import { ShopStep } from "./ShopStep";
import s from "./play.module.css";

const STEP_LABELS = [["background", "你的家"], ["room", "上傳房間"], ["hazards", "居家安全"], ["shop", "採買"], ["place", "擺用品"], ["node", "飼養"], ["report", "報告"]] as const;
const LEVEL = { high: "高", medium: "中", low: "低" } as const;
const SCAN_BASE = process.env.NEXT_PUBLIC_ROOM_DEMO_BASE?.trim() || null;
const ROOM_SCENE = houseScene([DEMO_DOLLHOUSE])[0];
const FURNITURE_NAMES = Object.fromEntries((DEMO_DOLLHOUSE.furniture ?? []).map((f, i) => [i, f.label]));
/** 原版場景的貓姿勢 → 3D 貓的動作（none＝貓不在畫面） */
const POSE_ACTION: Record<CatPose, CatAction | null> = {
  sit: "idle", underbed: "hide", hide: "hide", sofa: "sofa", zoom: "explore", frail: "sleep", bed: "sleep", table: "idle", none: null,
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

export function PlayGame({ catHref }: { catHref: string }) {
  const [state, dispatch] = useReducer((st: ReturnType<typeof initialPlay>, a: PlayAction) => playReducer(st, a), undefined, initialPlay);
  const home = usePlayerHome();
  const [room, setRoom] = useState<{ kind: RoomKind; inventory: RoomInventory; notice: string | null } | null>(null);
  const [hazardsLoading, setHazardsLoading] = useState(false);
  const [pick, setPick] = useState<ShopPick>(emptyShop);
  const taste = useRef<{ toyPref: ToyKey; rhythm: RhythmKey } | null>(null);
  const [placed, setPlaced] = useState<PlacedHouseholdItem[]>([]);
  const [placing, setPlacing] = useState<PlayItem["id"]>("bowl");
  /** 掃描房間：RoomViewer 不能放模型，先記下選的位置（家具名稱） */
  const [scanSpots, setScanSpots] = useState<Partial<Record<PlayItem["id"], string>>>({});
  const [lines, setLines] = useState<Partial<Record<NodeId, Line[]>>>({});
  const top = useRef<HTMLHeadingElement>(null);

  const catName = PLAY_CAT.name;
  const labels = useMemo(() => room?.inventory.labels ?? [], [room]);
  const places = useMemo(() => ({ hide: homeWord("躲藏處", labels) ?? "角落", high: homeWord("高處", labels) ?? "", sofa: "沙發" }), [labels]);
  const node = STORY[state.nodeIndex];
  const cur = state.cur;
  const shop = shopCost(pick, "kitten");
  const shopMissing = [...(pick.budget ? [] : ["每月預算"]), ...shop.missing];

  // 換步驟時回到頁首（手機上一屏放不下）
  useEffect(() => { top.current?.scrollIntoView({ block: "start", behavior: "auto" }); }, [state.step, state.nodeIndex]);

  const onRoomReady = useCallback((r: { kind: RoomKind; inventory: RoomInventory; notice: string | null }) => setRoom(r), []);

  // 居家危險：進入這一步時請 AI 看物品清單；失敗時規則對照
  useEffect(() => {
    if (state.step !== "hazards" || !room || state.hazards.length) return;
    setHazardsLoading(true);
    const body = { labels: room.inventory.labels.slice(0, 40).map(l => l.slice(0, 20)), hasWindow: room.inventory.hasWindow };
    const set = (hazards: Hazard[]) => { dispatch({ type: "setHazards", hazards }); setHazardsLoading(false); };
    fetch("/api/play/hazards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { hazards?: Hazard[] }) => set(j.hazards?.length ? j.hazards : ruleHazards(body)))
      .catch(() => set(ruleHazards(body)));
  }, [state.step, room, state.hazards.length, dispatch]);

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
  const action: CatAction | null = state.step !== "node" ? "idle"
    : miniId === "hide" ? "hide" : miniId === "scoop" ? "litter" : miniId === "play" ? "explore" : POSE_ACTION[state.scene.cat];
  const sceneKey = state.step === "node" ? `${state.nodeIndex}:${state.scene.bg}:${state.scene.time}:${state.scene.cat}:${miniId}` : state.step;
  const goal = useMemo<(RoomClick & { at: number }) | null>(() => {
    if (state.step !== "node" || !action) return null;
    const g = goalFor(ROOM_SCENE, action, places, spots);
    return g && { ...g, at: Date.now() };
    // 只在場景換了才重算（sceneKey），不然貓會一直被拉回去
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey, places, spots]);
  const clip = state.step === "node" && action === "sleep" ? "sleep" : null;
  const look = action === null ? null : playCatLook(state.step === "node" || state.step === "report" ? node.body : "kitten");

  const startNodes = () => {
    taste.current = { toyPref: pickOne(["feather", "mouse", "ribbon"] as const), rhythm: pickOne(["quick", "slow"] as const) };
    // 原版 fullBegin：依採買記下幾件事
    const shopPicks: { t: string; good: boolean | null }[] = [];
    if (!pick.scratcher) shopPicks.push({ t: "採買時沒有買貓抓板", good: null });
    if (pick.dryId && !pick.wetId) shopPicks.push({ t: "只準備了乾糧，貓喝水可能不夠", good: null });
    if (pick.fund) shopPicks.push({ t: "每月存醫療預備金", good: true });
    dispatch({ type: "startNodes", labels, once: shop.once, monthly: shop.month, shopPicks });
  };
  const miniCtx: MiniCtx = {
    age: node.id === "first-day" ? 2 : node.age, toys: ["feather"],
    cat: { body: 5, trust: state.life.trust, stress: state.life.stress, toyPref: taste.current?.toyPref ?? "feather", rhythm: taste.current?.rhythm ?? "quick" },
  };

  const placeAt = (id: PlayItem["id"], at: { x: number; z: number; y: number; support: PlaceAt["support"] }) => {
    const item = playItem(id);
    setPlaced(list => [...list.filter(p => !p.key.startsWith(`${id}:`)), {
      key: `${id}:${Date.now()}`, roomId: DEMO_DOLLHOUSE.id, url: item.url, name: item.name,
      x: at.x, z: at.z, y: at.y, support: at.support, widthM: item.widthM, depthM: item.depthM, heightM: item.heightM,
    }]);
    const other = PLAY_ITEMS.find(i => i.id !== id && !placed.some(p => p.key.startsWith(`${i.id}:`)));
    if (other) setPlacing(other.id);
  };
  const kind = room?.kind ?? "dollhouse";
  const placedIds = PLAY_ITEMS.filter(i => (kind === "scan" ? scanSpots[i.id] : placed.some(p => p.key.startsWith(`${i.id}:`)))).map(i => i.id);
  const spotList = useMemo(() => {
    if (kind === "scan") return [...labels.slice(0, 6).map(l => ({ x: 0, z: 0, label: `${l}旁` })), { x: 0, z: 0, label: "房間角落" }];
    const item = playItem(placing);
    return itemSpots(ROOM_SCENE, item, spots.filter(x => x.id !== placing), FURNITURE_NAMES);
  }, [kind, labels, placing, spots]);
  const choose = (p: { x: number; z: number; label: string }) => {
    if (kind !== "scan") { placeAt(placing, { x: p.x, z: p.z, y: 0, support: null }); return; }
    setScanSpots(v => ({ ...v, [placing]: p.label }));
    const other = PLAY_ITEMS.find(i => i.id !== placing && !scanSpots[i.id]);
    if (other) setPlacing(other.id);
  };

  const stepIndex = STEP_LABELS.findIndex(([k]) => k === state.step);
  const showStage = room && (state.step === "hazards" || state.step === "place" || state.step === "node");

  return (
    <div className={s.page}>
      <h1 className={s.title} ref={top}><span>{catName}的</span><span>虛擬飼養</span></h1>
      <ol className={s.steps} aria-label="進度">
        {STEP_LABELS.map(([k, label], i) => <li key={k} aria-current={i === stepIndex ? "step" : undefined}>{label}</li>)}
      </ol>

      {showStage && (
        <PlayStage kind={kind} scanBase={SCAN_BASE} look={look} placed={placed}
          tag={state.step === "node" ? node.label : undefined}
          goal={goal} clip={clip} speed={state.step === "node" ? node.speed : 1}
          onDrop={state.step === "place" && kind === "dollhouse"
            ? (id, at) => { if (PLAY_ITEMS.some(i => i.id === id)) placeAt(id as PlayItem["id"], at); }
            : undefined}>
        </PlayStage>
      )}

      {state.step === "background" && (
        <section className={s.card} aria-labelledby="home-title">
          <span className={s.kicker}>{catName}・{PLAY_CAT.coat}・幼貓</span>
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
              <div className={s.actions}><CatButton onClick={() => dispatch({ type: "next" })}>上傳我的房間</CatButton></div>
            </>
          )}
        </section>
      )}

      {state.step === "room" && !room && <RoomStep scanBase={SCAN_BASE} onReady={onRoomReady} />}
      {state.step === "room" && room && (
        <section className={s.card} aria-labelledby="room-done">
          <h2 id="room-done">房間建好了</h2>
          {room.notice && <p className={s.missing} role="status">{room.notice}</p>}
          <p className={s.lead}>房間裡有這些東西：</p>
          <ul className={s.chips}>{room.inventory.labels.map(l => <li key={l}>{l}</li>)}</ul>
          <div className={s.actions}><CatButton onClick={() => dispatch({ type: "next" })}>請 AI 檢查居家安全</CatButton></div>
        </section>
      )}

      {state.step === "hazards" && (
        <section className={s.card} aria-labelledby="haz-title" aria-busy={hazardsLoading}>
          <h2 id="haz-title">居家安全清單</h2>
          {hazardsLoading || !state.hazards.length ? <p className={s.lead} role="status">AI 正在看你的房間…</p> : (
            <>
              <p className={s.lead}>勾選你接貓回家前會處理的項目。</p>
              <ul className={s.hazards}>
                {state.hazards.map(h => (
                  <li key={h.key}>
                    <div className={s.hazHead}>
                      <strong>{h.label}</strong>
                      <span className={s.level} data-level={h.level}>風險{LEVEL[h.level]}</span>
                    </div>
                    <p>{h.advice}</p>
                    <label className={s.check}>
                      <input type="checkbox" checked={state.handled.includes(h.key)} onChange={() => dispatch({ type: "toggleHandled", key: h.key })} />
                      我會處理
                    </label>
                  </li>
                ))}
              </ul>
              <div className={s.actions}><CatButton onClick={() => dispatch({ type: "next" })}>下一步：預算與採買</CatButton></div>
            </>
          )}
        </section>
      )}

      {state.step === "shop" && (
        <>
          <ShopStep pick={pick} onChange={setPick} />
          {shopMissing.length > 0 && <p className={s.missing}>還缺：{shopMissing.join("、")}</p>}
          <div className={s.actions}>
            <CatButton disabled={shopMissing.length > 0} onClick={() => dispatch({ type: "next" })}>下一步：擺放用品</CatButton>
          </div>
        </>
      )}

      {state.step === "place" && (
        <section className={s.card} aria-labelledby="place-title">
          <h2 id="place-title">把餐碗和貓砂盆放進房間</h2>
          {kind === "scan" && <p className={s.lead}>掃描房間先選位置，用品會出現在劇情裡。</p>}
          <div className={s.chips} role="group" aria-label="要放的用品">
            {PLAY_ITEMS.map(i => (
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
          {placedIds.length < PLAY_ITEMS.length && <p className={s.missing}>還缺：{PLAY_ITEMS.filter(i => !placedIds.includes(i.id)).map(i => i.name).join("、")}</p>}
          <div className={s.actions}>
            <CatButton disabled={placedIds.length < PLAY_ITEMS.length} onClick={startNodes}>帶{catName}回家</CatButton>
          </div>
        </section>
      )}

      {state.step === "node" && (
        <NodeStep state={state} personal={personal}
          onNext={() => dispatch({ type: "next" })} onChoose={i => dispatch({ type: "choose", index: i })} />
      )}
      {state.step === "node" && cur?.kind === "mini" && (
        <CatgameMini key={`${state.nodeIndex}:${cur.mini}:${state.life.picks.length}`} id={cur.mini} ctx={miniCtx}
          onDone={r => dispatch({ type: "miniDone", result: r })} />
      )}

      {state.step === "report" && home && (
        <ReportStep state={state} pick={pick} monthly={shop.month} home={home} catHref={catHref}
          onRestart={() => { dispatch({ type: "restart" }); setRoom(null); setPlaced([]); setScanSpots({}); setLines({}); }} />
      )}
    </div>
  );
}
