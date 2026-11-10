#!/usr/bin/env python3
"""本機轉換 worker：領取網站排隊的房間影片，跑 room_demo.sh，把 3D 成果放回工作資料夾。

  python3 pipeline/room_worker.py rooms/local_jobs          本機模式，持續等工作，Ctrl+C 結束
  python3 pipeline/room_worker.py --supabase                領團隊 Supabase 的工作，金鑰放 .env.worker
  加 --once 處理完目前的工作就結束

本機資料夾內容：room.json（狀態）、source.*（原始影片）、result/（成果）。
本機模式每間房間一個資料夾；Supabase 模式讀 meow_room_jobs：
  後台房間（owner_household_id 是 null）：影片在 meow-room-videos，成果傳到公開的 meow-room-models。
  前台我的 3D 房間（有 owner_household_id）：影片在 Azure 私有容器 homes/<喵戶>/videos/…（#273，.env.worker 設
    AZURE_STORAGE_ACCOUNT／KEY／CONTAINER），下載後再檢查一次格式、大小、長度（#243）；成果傳到私有的
    meow-home-scenes/<喵戶>/<房間>/，完成或失敗都通知喵戶長。影片不刪，由主站的清理程式刪（#242）。
後台房間成功後刪除原始影片、影格和中間檔（決策 007）；失敗時保留影片，可以把狀態改回 queued 重試。
"""
import argparse
import json
import os
import platform
import secrets
import shutil
import signal
import subprocess
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

try:
    import fcntl
except ImportError:  # Windows 沒有 fcntl：本機單獨跑時不用鎖
    fcntl = None

ROOT = Path(__file__).resolve().parent.parent
POLL_SECONDS = 5
VIDEO_BUCKET = "meow-room-videos"
RESULT_BUCKET = "meow-room-models"
MAX_HOME_VIDEO_BYTES = 300 * 1024 * 1024  # 跟主站 src/lib/home-room.ts 一致（#243）
MAX_HOME_VIDEO_SEC = 180
HOME_RESULT_BUCKET = "meow-home-scenes"
RESULT_FILES = ["scene.json", "scene.cameras.json", "scene.layout.json"]
THUMB = "thumb.jpg"
GPU_LOCK = "/tmp/meowho-gpu.lock"  # 和 workers/cat-paint 共用（#200），同一台 VM 輪流用 T4


@contextmanager
def gpu_lock():
    """拿到鎖才領工作，貓咪上色在用 GPU 就等它做完；等待中的工作維持 queued。"""
    if fcntl is None:
        yield
        return
    with open(GPU_LOCK, "w") as f:
        fcntl.flock(f, fcntl.LOCK_EX)  # process 結束時作業系統會自動放開
        yield


def save(path, room):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(room, indent=2, ensure_ascii=False))
    tmp.replace(path)


def step_of(timing):
    """timing.json 最後一步的名稱，顯示在後台。"""
    try:
        steps = json.loads(timing.read_text())["steps"]
        return steps[-1]["name"] if steps else "準備中"
    except (OSError, ValueError, KeyError):
        return "準備中"


def copy_result(built, result):
    (result / "objects").mkdir(parents=True, exist_ok=True)
    for name in RESULT_FILES:
        shutil.copy2(built / name, result / name)
    objects = built / "objects"
    if (objects / "room_cut.splat").exists():
        for f in [objects / "room_cut.splat", *objects.glob("*.movable.splat")]:
            shutil.copy2(f, result / "objects" / f.name)
    else:
        shutil.copy2(built / "scene.splat", result / "scene.splat")


def make_thumb(video, target):
    """從影片中間抽一張小圖給後台列表；失敗不影響轉換。"""
    try:
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                               capture_output=True, text=True, check=True)
        half = float(probe.stdout.strip() or 0) / 2
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{half:.2f}", "-i", str(video), "-frames:v", "1",
                        "-vf", "scale=320:-2", "-q:v", "4", str(target)], check=True)
        return target.exists()
    except (OSError, ValueError, subprocess.CalledProcessError):
        return False


def convert(video, room_id, on_step, result, log_path):
    """跑完整流程，成果放進 result；成功後清掉影格和中間檔。"""
    built = ROOT / "rooms" / room_id

    def report(step):
        try:
            on_step(step)
        except OSError as e:  # 進度只是給後台看的，網路斷一下不能中斷轉換
            print(f"[worker] 進度「{step}」沒送出：{e}", flush=True)

    report("抽影格")
    with log_path.open("w") as log:
        # 自己一個 process group，出錯時才能連 Brush、Python 這些子程式一起結束
        proc = subprocess.Popen(["pipeline/room_demo.sh", str(video), room_id], cwd=ROOT, stdout=log,
                                stderr=subprocess.STDOUT, start_new_session=True)
        try:
            step = "抽影格"
            while proc.poll() is None:
                time.sleep(POLL_SECONDS)
                latest = step_of(built / "timing.json")
                if latest not in (step, "準備中"):  # 只在換步驟時回報
                    step = latest
                    report(step)
        finally:
            # 任何錯誤或 Ctrl+C 都不能留下還在跑的轉換：它和下一個工作共用 input_frames、colmap_ws
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"{step}失敗")
    copy_result(built, result)
    make_thumb(video, result / THUMB)
    shutil.copy2(built / "timing.json", result.parent / "timing.json")
    # 影格和切物品的除錯圖都是家裡的畫面，成果複製出來後就不留
    for path in (built, ROOT / "input_frames", ROOT / "colmap_ws"):
        shutil.rmtree(path, ignore_errors=True)


class Supabase:
    """用 service role 呼叫 Supabase REST，金鑰只放在執行 worker 的電腦。"""

    def __init__(self, url, key):
        self.url = url.rstrip("/")
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    def request(self, method, path, data=None, headers=None):
        req = urllib.request.Request(f"{self.url}{path}", data=data, method=method, headers={**self.headers, **(headers or {})})
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.read()

    def rest(self, method, path, body=None, prefer=None):
        headers = {"Content-Type": "application/json", **({"Prefer": prefer} if prefer else {})}
        raw = self.request(method, f"/rest/v1/{path}", None if body is None else json.dumps(body).encode(), headers)
        return json.loads(raw) if raw else None

    def download(self, bucket, path, target):
        target.write_bytes(self.request("GET", f"/storage/v1/object/{bucket}/{quote(path)}"))

    def upload(self, bucket, path, source):
        kind = {".json": "application/json", ".jpg": "image/jpeg"}.get(source.suffix, "application/octet-stream")
        self.request("POST", f"/storage/v1/object/{bucket}/{quote(path)}", source.read_bytes(), {"Content-Type": kind, "x-upsert": "true"})

    def remove(self, bucket, path):
        self.request("DELETE", f"/storage/v1/object/{bucket}/{quote(path)}")


class AzureBlob:
    """前台居家影片的 Azure 私有容器（決策 006）。本機用儲存帳戶金鑰；搬上 VM 再改 Managed Identity。"""

    def __init__(self, account, key, container):
        from azure.storage.blob import ContainerClient
        self.client = ContainerClient(f"https://{account}.blob.core.windows.net", container,
                                      credential={"account_name": account, "account_key": key})

    def download(self, path, target):
        with open(target, "wb") as f:
            self.client.download_blob(path).readinto(f)


def check_home_video(video):
    """主站簽網址前檢查過，下載後再檢查一次（#243），擋掉被換掉或壞掉的檔案。"""
    if video.suffix.lower() not in (".mp4", ".mov"):
        raise RuntimeError("影片格式不對，只收 mp4／mov")
    if video.stat().st_size > MAX_HOME_VIDEO_BYTES:
        raise RuntimeError("影片超過 300 MB")
    import cv2
    cap = cv2.VideoCapture(str(video))
    fps, frames = cap.get(cv2.CAP_PROP_FPS), cap.get(cv2.CAP_PROP_FRAME_COUNT)
    cap.release()
    if not (fps > 0 and frames > 0):  # 讀不到時 OpenCV 回 -1
        raise RuntimeError("讀不到影片")
    if frames / fps > MAX_HOME_VIDEO_SEC + 1:  # 影格數換算的秒數會有些微誤差，多給 1 秒
        raise RuntimeError("影片超過 180 秒")


def now():
    return datetime.now(timezone.utc).isoformat()


def claim(sb):
    """領最早的工作。兩個 worker 同時搶時，只有一個的更新會成功。"""
    jobs = sb.rest("GET", "meow_room_jobs?status=eq.queued&order=queued_at.asc&limit=1&select=id,room_id")
    if not jobs:
        return None
    job = jobs[0]
    done = sb.rest("PATCH", f"meow_room_jobs?id=eq.{job['id']}&status=eq.queued",
                   {"status": "running", "step": "準備中", "worker_id": platform.node(), "started_at": now()},
                   prefer="return=representation")
    return job if done else None


def object_labels(scene_json):
    """給前台任務找家具用的物品清單（meta.objects[].label，網站的 roomFurniture() 讀，名稱要是中文才對得到 placeFor()）。"""
    from catalog import NAMES_ZH
    labels = [o.get("label") for o in json.loads(scene_json.read_text()).get("objects", [])]
    return [{"label": NAMES_ZH.get(l, l)} for l in dict.fromkeys(l for l in labels if l)]


def finish_home(sb, room_id, household, ok):
    """前台房間處理完：通知喵戶長。影片不刪，由主站的清理程式在 3D 和健檢都結束後刪（#242）。"""
    try:
        owner = sb.rest("GET", f"meow_households?id=eq.{household}&select=owner_id")[0]["owner_id"]
        sb.rest("POST", "meow_notifications", {
            "user_id": owner, "type": "home_room_ready" if ok else "home_room_failed",
            "title": "你家的 3D 房間建好了" if ok else "3D 房間沒有建成功",
            "body": "來看看，沒問題就按「完成」。" if ok else "請照拍攝須知重新拍一次。",
            "link": f"/homes/{household}/scene"})
    except (OSError, IndexError, KeyError) as e:
        print(f"[worker] {room_id}：通知沒送出：{e}", flush=True)


def report_failed(sb, room_row, job_row, error):
    try:
        sb.rest("PATCH", room_row, {"status": "failed", "updated_at": now()})
        sb.rest("PATCH", job_row, {"status": "error", "error": error, "finished_at": now()})
    except OSError as e:  # 斷線時下次啟動由 fail_stale 收尾
        print(f"[worker] 回報失敗沒送出：{e}", flush=True)


def fail_stale(sb):
    """上次中斷（當掉、Ctrl+C、睡眠）留下的 running 工作標成失敗，雲端影片還在，可以改回 queued 重試。
    每台機器只跑一個 worker，所以啟動時本機名下的 running 都是中斷的。"""
    stale = sb.rest("GET", f"meow_room_jobs?status=eq.running&worker_id=eq.{quote(platform.node())}&select=id,room_id")
    for job in stale or []:
        print(f"[worker] 上次中斷的工作 {job['room_id']} 標成失敗", flush=True)
        report_failed(sb, f"meow_room_models?id=eq.{job['room_id']}", f"meow_room_jobs?id=eq.{job['id']}", "worker 中斷")


def run_next_supabase(sb, blob=None):
    job = claim(sb)
    if not job:
        return False
    room_id = job["room_id"]
    room_row = f"meow_room_models?id=eq.{room_id}"
    job_row = f"meow_room_jobs?id=eq.{job['id']}"
    print(f"[worker] 開始 {room_id}", flush=True)
    work = ROOT / "rooms" / "worker_tmp" / room_id
    set_step = lambda step: sb.rest("PATCH", job_row, {"step": step})
    household = None
    try:
        sb.rest("PATCH", room_row, {"status": "running", "updated_at": now()})
        work.mkdir(parents=True, exist_ok=True)
        row = sb.rest("GET", f"{room_row}&select=video_path,meta,owner_household_id")[0]
        video_path, household = row["video_path"], row.get("owner_household_id")
        if not video_path:
            raise RuntimeError("沒有影片，可能已經轉換過")
        video = work / Path(video_path).name
        set_step("下載影片")
        if household:
            if not blob:
                raise RuntimeError(".env.worker 沒有設定 Azure，讀不到前台影片")
            blob.download(video_path, video)
            check_home_video(video)
        else:
            sb.download(VIDEO_BUCKET, video_path, video)
        convert(video, room_id, set_step, work / "result", work / "worker.log")
        set_step("上傳成果")
        # 前台：私有 bucket，路徑第一層要是喵戶 id（RLS 才讀得到）；後台：bucket 是公開的，用隨機名稱讓人猜不到網址
        bucket, result_path = (HOME_RESULT_BUCKET, f"{household}/{room_id}") if household else (RESULT_BUCKET, f"results/{secrets.token_hex(8)}")
        for f in (work / "result").rglob("*"):
            if f.is_file():
                sb.upload(bucket, f"{result_path}/{f.relative_to(work / 'result').as_posix()}", f)
        # meta 也放上傳時的備註，只加上縮圖檔名（前台再加物品清單），不覆蓋其他欄位
        meta = {**(row.get("meta") or {}), **({"thumb": THUMB} if (work / "result" / THUMB).exists() else {})}
        if household:
            meta["objects"] = object_labels(work / "result" / "scene.json")
        # 前台的 video_path 留著，主站的清理程式刪影片時才清
        sb.rest("PATCH", room_row, {"status": "ready", "result_path": result_path, "meta": meta, "updated_at": now(),
                                    **({} if household else {"video_path": None})})
        sb.rest("PATCH", job_row, {"status": "done", "step": None, "finished_at": now()})
        print(f"[worker] {room_id}：ready", flush=True)
        if household:
            finish_home(sb, room_id, household, ok=True)
        else:
            try:  # 房間已經 ready，影片刪不掉只留警告，不能再改成失敗
                sb.remove(VIDEO_BUCKET, video_path)
            except OSError as e:
                print(f"[worker] {room_id}：雲端影片沒刪掉，請手動刪除 {video_path}：{e}", flush=True)
    except Exception as e:  # 任何錯誤都要回報，不然工作會卡在 running；後台失敗時保留雲端影片，方便重試
        print(f"[worker] {room_id}：failed {e!r}", flush=True)
        report_failed(sb, room_row, job_row, str(e) or "轉換失敗")
        if household:  # 通知飼主重新拍一次；影片由主站的清理程式刪
            finish_home(sb, room_id, household, ok=False)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return True


def read_env(path):
    values = dict(os.environ)
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip()
    return values


def run_next(root):
    for state in sorted(root.glob("room_*/room.json")):
        room = json.loads(state.read_text())
        if room["status"] != "queued":
            continue
        print(f"[worker] 開始 {room['id']} {room['name']}", flush=True)
        room.update(status="running", step="準備中", error=None, startedAt=now(), finishedAt=None)
        save(state, room)
        def on_step(step):
            room["step"] = step
            save(state, room)
        try:
            video = next(state.parent.glob("source.*"))
            convert(video, room["id"], on_step, state.parent / "result", state.parent / "worker.log")
            video.unlink()
            room.update(status="ready", step=None)
        except Exception as e:  # 任何錯誤都標成失敗，不要卡在 running
            room.update(status="failed", error=str(e) or "轉換失敗")
        room["finishedAt"] = now()
        save(state, room)
        print(f"[worker] {room['id']}：{room['status']}", flush=True)
        return True
    return False


def main():
    ap = argparse.ArgumentParser(description="本機轉換 worker")
    ap.add_argument("root", type=Path, nargs="?", help="本機模式的工作資料夾")
    ap.add_argument("--supabase", action="store_true", help="改領團隊 Supabase 的工作")
    ap.add_argument("--env", type=Path, default=ROOT / ".env.worker", help="放 Supabase 網址和金鑰的檔案")
    ap.add_argument("--once", action="store_true", help="處理完目前的工作就結束")
    args = ap.parse_args()
    # room_demo.sh 的 AI 辨識物品要用，子程序會繼承
    if key := read_env(args.env).get("GEMINI_API_KEY"):
        os.environ["GEMINI_API_KEY"] = key
    if args.supabase:
        env = read_env(args.env)
        url, key = env.get("NEXT_PUBLIC_SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            ap.error(f"請在 {args.env} 設定 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY")
        sb = Supabase(url, key)
        account, blob_key, container = env.get("AZURE_STORAGE_ACCOUNT"), env.get("AZURE_STORAGE_KEY"), env.get("AZURE_STORAGE_CONTAINER")
        blob = AzureBlob(account, blob_key, container) if account and blob_key and container else None
        if not blob:
            print(f"[worker] {args.env} 沒有設定 AZURE_STORAGE_ACCOUNT／KEY／CONTAINER，前台的房間會失敗", flush=True)
        try:
            fail_stale(sb)
        except OSError as e:
            print(f"[worker] 檢查上次中斷的工作失敗：{e}", flush=True)
        work = lambda: run_next_supabase(sb, blob)
        print(f"[worker] 等待 Supabase 的工作（前台影片讀 Azure {container or '未設定'}）", flush=True)
    else:
        if not args.root:
            ap.error("本機模式要指定工作資料夾，或加 --supabase")
        args.root.mkdir(parents=True, exist_ok=True)
        work = lambda: run_next(args.root)
        print(f"[worker] 等待 {args.root} 的工作", flush=True)
    while True:
        try:
            with gpu_lock():
                worked = work()
        except urllib.error.URLError as e:  # 網路斷線不要讓 worker 結束
            print(f"[worker] 連線失敗，稍後重試：{e}", flush=True)
            worked = False
        if args.once and not worked:
            return
        if not worked:
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
