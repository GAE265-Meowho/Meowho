"use client";
// 建立我家的 3D 房間（規格 09 v0.6 §7.2、§8；#60、#61）：房間掃描教練（ScanCoach）＋隱私說明 →「開始製作」或「上傳影片」→ 背景建房間，同時做環境安全檢查。
// 環境檢查一律做、不再詢問（子哲 2026-11-04）；3D 房間和環境報告處理完（成功或失敗）立即刪除居家原始影片和照片（決策 007）。
// 「開始製作」用手機錄影、「上傳影片」選檔 → 瀏覽器直傳私有 bucket meow-home-videos → /api/homes/[id]/room 建 queued 的房間和環境報告
//   → workers/room-convert 轉成 3D（約 20 分鐘，好了會通知）→ 這頁預覽，按「完成」呼叫 meow_finish_home_room，之後才能開始領養任務。
// 房間已經有了（喵戶卡片的「查看模型」）也進這頁。?next= 是建好後要回去的那一步（例如某隻貓的領養任務）。
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import s from "@/components/me/me.module.css";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { safeNext } from "@/lib/household-gate";
import { HOME_VIDEO_BUCKET, homeSceneBase, UPLOAD_PRIVACY } from "@/lib/home-room";
import { checkVideo, MAX_VIDEO_BYTES, videoExt } from "@/lib/hq/rooms/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import ScanCoach from "./ScanCoach";
import r from "./scene.module.css";

// 檢視器碰 WebGL，只能在瀏覽器載入
const RoomViewer = dynamic(() => import("@/components/hq/assets/RoomViewer"), { ssr: false, loading: () => <p className={f.lead} role="status">房間載入中…</p> });

type Step = "guide" | "uploading" | "making" | "done";
interface Room { id: string; status: string; completed_at: string | null; result_path: string | null }

export default function ScenePage() {
  const { id } = useParams<{ id: string }>();
  const { loading, user, login } = useAuth();
  const sb = getBrowserSupabase();
  // 最新的一間房間；null＝還沒建過
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const [finishing, setFinishing] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [next, setNext] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("guide");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("next");
    setNext(n ? safeNext(n) : null);
  }, []);

  useEffect(() => {
    if (!sb) { setRoom(null); return; }
    if (loading || !user) return;
    // 已經按過完成的房間優先（之後重拍失敗也不影響已經能用的房間），否則看最新一間
    sb.from("meow_room_models").select("id, status, completed_at, result_path").eq("owner_household_id", id)
      .order("completed_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => setRoom(data?.[0] ?? null));
  }, [loading, sb, user, id]);

  async function upload(file: File | undefined) {
    if (!file) return;
    // 示範模式（沒有資料庫）：直接當作做好了
    if (!sb) { setStep("done"); return; }
    const problem = checkVideo(file.type, file.size);
    if (problem) {
      setError(problem === "video_too_large" ? `影片超過 ${MAX_VIDEO_BYTES / 1024 / 1024} MB，請拍短一點或分段上傳。` : "請上傳 mp4 或 mov 影片。");
      return;
    }
    setStep("uploading"); setError(null);
    const path = `${id}/${crypto.randomUUID()}.${videoExt(file.type)}`;
    const { error: upError } = await sb.storage.from(HOME_VIDEO_BUCKET).upload(path, file, { contentType: file.type });
    if (upError) { setError("影片上傳失敗，請再試一次。"); setStep("guide"); return; }
    const res = await fetch(`/api/homes/${id}/room`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoPath: path }) })
      .then(x => x.json()).catch(() => null);
    if (!res?.roomId || res.error) {
      await sb.storage.from(HOME_VIDEO_BUCKET).remove([path]);  // 沒建成房間的影片不留（決策 007）
      setError(res?.error === "room_busy" ? "上一支影片還在處理中，好了會通知你。" : "房間建立失敗，請再試一次。");
      setStep("guide"); return;
    }
    setRoom({ id: res.roomId, status: "queued", completed_at: null, result_path: null });
    setStep("making");
  }

  async function finish() {
    if (!sb || !room) return;
    setFinishing(true); setError(null);
    const { error: rpcError } = await sb.rpc("meow_finish_home_room", { p_room_id: room.id, p_env_check: null });
    setFinishing(false);
    if (rpcError) { setError("沒有存成功，請再試一次。"); return; }
    setRoom({ ...room, completed_at: new Date().toISOString() });
    setStep("done");
  }

  const goTask = next ?? "/#adopt";
  let body: React.ReactNode;
  if (sb && !loading && !user) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>登入後建立你家的 3D 房間</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton onClick={() => login(window.location.pathname + window.location.search)}>使用 Google 登入</CatButton></div>
    </section>
  );
  else if (room === undefined) body = <p className={f.lead} role="status">載入中…</p>;
  else if (step === "done" || room?.completed_at) body = (
    <section className={`${f.card} ${f.center}`} aria-labelledby="room-done">
      <span className={f.avatar} aria-hidden="true"><Icon name="scan" /></span>
      {/* 示範房間不會產生環境報告，先不說「安全報告好了」；接上真正流程後改成 §8 的「你家的 3D 房間和安全報告好了」 */}
      <h2 id="room-done">你家的 3D 房間建好了</h2>
      <p className={f.lead}>來看看貓在裡面走的樣子。</p>
      {/* 示範房間沒有成果檔（result_path 是 null），只有影片轉出來的才看得到 3D */}
      {room?.result_path && <div className={r.viewer}><RoomViewer base={homeSceneBase(id, room.id)} /></div>}
      <div className={f.actions} style={{ justifyContent: "center" }}>
        <CatButton href={goTask}>去體驗領養任務</CatButton>
        <CatButton variant="ghost" href="/me">回到我的喵戶</CatButton>
      </div>
    </section>
  );
  else if (room?.status === "ready") body = (
    <>
      <section className={`${f.card} ${r.viewer}`} aria-labelledby="room-preview">
        <h2 id="room-preview">看看你家的 3D 房間</h2>
        <p className={f.lead}>拖曳轉頭、滾輪前後走。沒問題就按「完成」。</p>
        <RoomViewer base={homeSceneBase(id, room.id)} />
      </section>
      {error && <p className={f.error} role="alert">{error}</p>}
      <div className={f.actions}>
        <CatButton onClick={finish} disabled={finishing}>{finishing ? "儲存中…" : "完成"}</CatButton>
      </div>
    </>
  );
  else if (step === "uploading") body = (
    <section className={`${f.card} ${f.center}`} role="status">
      <h2>影片上傳中</h2>
      <p className={f.lead}>上傳完成前請不要關掉這頁。</p>
    </section>
  );
  else if (step === "making" || room?.status === "queued" || room?.status === "running") body = (
    <section className={`${f.card} ${f.center}`} role="status">
      <h2>正在建立你家的 3D 房間</h2>
      <p className={f.lead}>你可以先離開，好了會通知你。</p>
    </section>
  );
  else body = (
    <ScanCoach onPick={() => picker.current?.click()} actions={<>
      {/* 隱私說明是業務規則要求的聲明（決策 007），用一般內文字級，放在按鈕正上方 */}
      <p className={f.lead}>{UPLOAD_PRIVACY}</p>
      {room?.status === "failed" && !error && <p className={f.error} role="alert">上一支影片沒有轉換成功，請照上面的規則重新拍一次。</p>}
      {error && <p className={f.error} role="alert">{error}</p>}
      <div className={f.actions}>
        <CatButton onClick={() => camera.current?.click()}><Icon name="video" size={18} />開始製作</CatButton>
        <CatButton variant="ghost" onClick={() => picker.current?.click()}><Icon name="plus" size={18} />上傳影片</CatButton>
      </div>
    </>} />
  );

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={f.title}>我家的 3D 房間</h1>
        {!sb && <p className={f.warn}>示範模式：還沒連接資料庫，房間不會儲存。</p>}
        {body}
        <input ref={camera} type="file" accept="video/*" capture="environment" hidden onChange={e => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={picker} type="file" accept="video/mp4,video/quicktime" hidden onChange={e => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      </main>
      <TabBar />
    </>
  );
}
