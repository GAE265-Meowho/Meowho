"""
本貓貼圖工作程式（GPU）：用 Hunyuan3D-Paint 依照貓咪照片，在母體的固定 UV 上畫出整隻貓的貼圖

母體依年齡選（MeowHQ 規格書 04 TBD-C）：≤ 6 個月用幼貓 cat_base_kitten，其他（含沒填年齡）用成貓 cat_base。
網格、骨架、動作都是母體共用的，只有這張貼圖是這隻貓自己的；貼圖只能套回畫它的那個母體（UV 不同）。

兩種任務來源（生成邏輯相同）：
  本機（預設）：Cat Studio／本機 MeowHQ 寫 adoption_cats/<貓咪ID>/paint_job.json（queued）→ 寫出 paint_albedo.png
  Supabase（--supabase）：線上 MeowHQ 建立 meow_cat_model_jobs（queued）→ 照片從 meow-cat-model-photos 下載
                          → 貼圖上傳到 meow-cat-models/cats/<貓咪ID>/ → 更新 meow_cat_models（目前版／上一版、母體版本）

執行方式（用有 Hunyuan3D-2 的 venv，另開一個視窗）:
    C:\\AI\\Hunyuan3D-2\\venv\\Scripts\\python.exe cat_studio\\paint_worker.py
    C:\\AI\\Hunyuan3D-2\\venv\\Scripts\\python.exe cat_studio\\paint_worker.py --supabase
    加 --once 只處理目前排隊的工作就結束
Supabase 金鑰：環境變數 NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY；沒設時讀 --env 指的檔案
（預設 MeowHome 的 .env.local）。金鑰只留在這台電腦，不寫進任何檔案。
"""
import argparse
import importlib.util
import io
import json
import os
import socket
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATS_DIR = ROOT / "adoption_cats"
DEFAULT_ENV = ROOT.parent / "CatHome" / "MeowHome" / ".env.local"
for cand in (Path(r"C:\AI\Hunyuan3D-2"), ROOT / "Hunyuan3D-2"):
    if (cand / "hy3dgen").is_dir():
        sys.path.insert(0, str(cand))
        break

import numpy as np
import requests
import torch
from PIL import Image, ImageOps

from hy3dgen.rembg import BackgroundRemover
from hy3dgen.texgen import Hunyuan3DPaintPipeline

KITTEN_MAX_MONTHS = 6
FILL_PARAMS = {"strength": 0.75}   # 單張照片：看不到的地方補得明顯一點（幼貓母體自己的預設 0.35 是給三視圖用的）


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Mother:
    """一個母體：固定 UV 的網格、眼睛位置、它自己的補花紋程式"""

    def __init__(self, body, folder, version):
        self.body, self.folder, self.version = body, folder, version
        # 兩個母體的腳本同名（step3_paint／step3b_fill），用不同模組名載入才不會互相蓋掉。
        # 載入 step3_paint 時會讓 Paint 沿用固定 UV（不重攤）
        self.paint_mod = load_module(f"{body}_step3_paint", folder / "step3_paint.py")
        self.fill_mod = load_module(f"{body}_step3b_fill", folder / "step3b_fill.py")
        self.mesh_path = folder / "work" / "base_uv.glb"
        eyes = json.loads((folder / "eyes.json").read_text(encoding="utf-8-sig"))
        self.eyes = {k: v for k, v in eyes.items() if k.startswith("eye_")}

    def mesh(self, view):
        """母體網格（Y 朝上、相機在 +Z）。側面照時繞 Y 轉，讓頭朝照片的左或右；回傳網格和原座標裡的相機方向"""
        mesh = self.paint_mod.load_with_uv(self.mesh_path)
        if view not in ("left", "right"):
            return mesh, (0.0, 0.0, 1.0)
        axis = self.fill_mod.body_frame(np.asarray(mesh.vertices), np.asarray(mesh.faces))["axis"]
        target = -1.0 if view == "left" else 1.0             # 相機在 +Z 往 -Z 看：畫面左邊是 -X
        theta = np.arctan2(axis[2], axis[0]) - np.arctan2(0.0, target)
        c, s = np.cos(theta), np.sin(theta)
        rot = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])   # x' = c·x + s·z、z' = -s·x + c·z
        mesh.vertices = np.asarray(mesh.vertices) @ rot.T
        return mesh, tuple(rot[2])                            # rot 的轉置 × (0,0,1)

    def fill(self, albedo, fill, photo_dir):
        return self.fill_mod.fill_pattern(self.paint_mod.load_with_uv(self.mesh_path), albedo, pattern=fill,
                                          params=FILL_PARAMS, eyes=self.eyes, photo_dir=photo_dir)


MOTHERS = {}


def body_for_age(age_months):
    return "kitten" if isinstance(age_months, (int, float)) and age_months <= KITTEN_MAX_MONTHS else "adult"


def mother_for(age_months):
    body = body_for_age(age_months)
    return mother_for_body(body)


def mother_for_body(body):
    if body not in ("adult", "kitten"):
        raise ValueError("不支援的體型")
    if body not in MOTHERS:
        folder, version = (ROOT / "cat_base_kitten", "kitten-v1") if body == "kitten" else (ROOT / "cat_base", "adult-v1")
        MOTHERS[body] = Mother(body, folder, version)
    return MOTHERS[body]


def remove_background(photo, rembg):
    image = ImageOps.exif_transpose(photo)
    image.thumbnail((1024, 1024))
    image = rembg(image.convert("RGB"))
    bbox = image.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()
    if bbox:  # 只留貓本體並留一點邊
        x0, y0, x1, y1 = bbox
        pad = int(max(x1 - x0, y1 - y0) * 0.1)
        image = image.crop((max(x0 - pad, 0), max(y0 - pad, 0), min(x1 + pad, image.width), min(y1 + pad, image.height)))
    return image.convert("RGBA")


class Worker:
    def __init__(self):
        self.rembg = BackgroundRemover()
        self.paint = None

    def get_paint(self):
        if self.paint is None:
            print("載入 Hunyuan3D-Paint（第一次約 1~3 分鐘）…")
            self.paint = Hunyuan3DPaintPipeline.from_pretrained("tencent/Hunyuan3D-2")
            self.paint.enable_model_cpu_offload()
        return self.paint

    def make_albedo(self, nobg, mother, view, fill, step):
        """去背後的照片 → 這隻貓的貼圖（PIL）。step(文字) 回報目前步驟"""
        step("載入模型")
        paint = self.get_paint()
        step("AI 上色（約 3~6 分鐘）")
        mesh, photo_dir = mother.mesh(view)
        albedo = paint(mesh, image=nobg).visual.material.image
        step("補花紋、眼皮邊")
        return mother.fill(albedo, fill, photo_dir)


# ───────── 本機來源：adoption_cats/<貓咪ID>/paint_job.json ─────────

def write_job(folder, **fields):
    path = folder / "paint_job.json"
    job = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    job.update(fields)
    path.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
    return job


def run_local(worker, folder):
    profile = json.loads((folder / "profile.json").read_text(encoding="utf-8"))
    job = json.loads((folder / "paint_job.json").read_text(encoding="utf-8"))
    view, fill = job.get("view") or "front", job.get("fill") or "none"
    start = time.time()
    print(f"[{datetime.now():%H:%M:%S}] 開始：{profile['name']}（{folder.name}，{view}，補花紋：{fill}）")
    try:
        write_job(folder, status="running", step="照片去背", started_at=datetime.now().isoformat(timespec="seconds"))
        nobg_path = folder / "photo_nobg.png"
        if nobg_path.is_file():
            nobg = Image.open(nobg_path).convert("RGBA")
        else:
            nobg = remove_background(Image.open(folder / profile["photo"]), worker.rembg)
            nobg.save(nobg_path)
        body = job.get("body_type") or body_for_age(profile.get("age_months"))
        mother = mother_for_body(body)
        tex = worker.make_albedo(nobg, mother, view, fill, lambda s: write_job(folder, step=s))
        tex.save(folder / "paint_albedo.png")
        if job.get("body_type"):
            tex.save(folder / f"paint_albedo_{body}.png")
        secs = round(time.time() - start)
        write_job(folder, status="done", step="完成", seconds=secs, mother=mother.folder.name, base_version=mother.version,
                  finished_at=datetime.now().isoformat(timespec="seconds"))
        print(f"    完成（{mother.version}），{secs // 60} 分 {secs % 60} 秒 → {folder / 'paint_albedo.png'}")
    except KeyboardInterrupt:
        write_job(folder, status="error", step="失敗", error="worker 被中斷，請重試")
        raise
    except Exception as e:
        traceback.print_exc()
        write_job(folder, status="error", step="失敗", error=f"{type(e).__name__}: {e}")
    finally:
        torch.cuda.empty_cache()


def queued_local():
    if not CATS_DIR.is_dir():
        return []
    jobs = []
    for job in CATS_DIR.glob("*/paint_job.json"):
        data = json.loads(job.read_text(encoding="utf-8"))
        if data.get("status") == "queued":
            jobs.append((data.get("queued_at", ""), job.parent))
    return [folder for _, folder in sorted(jobs)]


# ───────── Supabase 來源：meow_cat_model_jobs／meow_cat_models ─────────

PHOTO_BUCKET = "meow-cat-model-photos"
MODEL_BUCKET = "meow-cat-models"


def read_env_file(path):
    out = {}
    if path and Path(path).is_file():
        for line in Path(path).read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Supabase:
    """只用 REST（PostgREST＋Storage），service role 金鑰；不需要額外套件"""

    def __init__(self, env_file):
        file_env = read_env_file(env_file)
        self.url = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or file_env.get("NEXT_PUBLIC_SUPABASE_URL", "")).rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or file_env.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not self.url or not key:
            raise SystemExit(f"找不到 Supabase 網址或 service role 金鑰（環境變數或 {env_file}）")
        self.s = requests.Session()
        self.s.headers.update({"apikey": key, "Authorization": f"Bearer {key}"})

    def _ok(self, r):
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase {r.request.method} {r.status_code}: {r.text[:200]}")
        return r

    def select(self, table, **params):
        return self._ok(self.s.get(f"{self.url}/rest/v1/{table}", params=params, timeout=30)).json()

    def patch(self, table, match, fields):
        """match 是 PostgREST 條件，例如 {"id": "eq.x", "status": "eq.queued"}；回傳實際改到的列"""
        r = self.s.patch(f"{self.url}/rest/v1/{table}", params=match, json=fields,
                         headers={"Prefer": "return=representation"}, timeout=30)
        return self._ok(r).json()

    def upsert(self, table, fields):
        r = self.s.post(f"{self.url}/rest/v1/{table}", params={"on_conflict": "model_id,body_type"}, json=fields,
                        headers={"Prefer": "resolution=merge-duplicates,return=representation"}, timeout=30)
        return self._ok(r).json()

    def download(self, bucket, path):
        r = self.s.get(f"{self.url}/storage/v1/object/{bucket}/{path}", timeout=120)
        return None if r.status_code in (400, 404) else self._ok(r).content

    def upload(self, bucket, path, data, content_type):
        r = self.s.post(f"{self.url}/storage/v1/object/{bucket}/{path}", data=data,
                        headers={"Content-Type": content_type, "x-upsert": "true"}, timeout=120)
        self._ok(r)

    def remove(self, bucket, path):
        self.s.delete(f"{self.url}/storage/v1/object/{bucket}", json={"prefixes": [path]}, timeout=30)


def png_bytes(image):
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def run_supabase(worker, sb, job, worker_id):
    """領取（queued → running，條件式更新：別的 worker 先領走就什麼都不做）→ 產生 → 上傳 → 更新"""
    claimed = sb.patch("meow_cat_model_jobs", {"id": f"eq.{job['id']}", "status": "eq.queued"},
                       {"status": "running", "step": "照片去背", "started_at": now_iso(), "worker_id": worker_id})
    if not claimed:
        return
    model_id = job["model_id"]
    view, fill = job.get("view") or "front", job.get("fill") or "none"
    start = time.time()

    def step(text):
        sb.patch("meow_cat_model_jobs", {"id": f"eq.{job['id']}"}, {"step": text})

    try:
        rows = sb.select("meow_cat_models", id=f"eq.{model_id}", select="*")
        if not rows:
            raise RuntimeError("找不到這隻貓的資料")
        model = rows[0]
        sb.patch("meow_cat_models", {"id": f"eq.{model_id}"}, {"status": "running", "updated_at": now_iso()})
        print(f"[{datetime.now():%H:%M:%S}] 開始：{model['name']}（{model_id}，{view}，補花紋：{fill}）")

        nobg_path = f"{model_id}/photo_nobg.png"
        cached = sb.download(PHOTO_BUCKET, nobg_path)
        if cached:
            nobg = Image.open(io.BytesIO(cached)).convert("RGBA")
        else:
            photo = sb.download(PHOTO_BUCKET, model["photo_path"])
            if not photo:
                raise RuntimeError("找不到原始照片，請重新上傳")
            nobg = remove_background(Image.open(io.BytesIO(photo)), worker.rembg)
            sb.upload(PHOTO_BUCKET, nobg_path, png_bytes(nobg), "image/png")

        body = job.get("body_type") or body_for_age((model.get("profile") or {}).get("age_months"))
        mother = mother_for_body(body)
        tex = worker.make_albedo(nobg, mother, view, fill, step)

        step("上傳貼圖")
        # 每次用新檔名：公開網址不會被瀏覽器／CDN 快取住舊圖
        new_path = f"cats/{model_id}/albedo_{body}_{datetime.now():%Y%m%d_%H%M%S}.png"
        sb.upload(MODEL_BUCKET, new_path, png_bytes(tex), "image/png")
        # 新任務按體型輪替；舊任務仍沿用既有欄位，避免影響尚未遷移的站台。
        variants = sb.select("meow_cat_model_variants", model_id=f"eq.{model_id}", body_type=f"eq.{body}", select="*") if job.get("body_type") else []
        variant = variants[0] if variants else None
        old_prev = variant.get("prev_albedo_path") if variant else (None if job.get("body_type") else model.get("prev_albedo_path"))
        old_current = variant.get("albedo_path") if variant else (None if job.get("body_type") else model.get("albedo_path"))
        old_base = variant.get("base_version") if variant else (None if job.get("body_type") else model.get("base_version"))
        secs = round(time.time() - start)
        # 上一版貼圖畫在哪個母體：MeowHQ「改用上一版」時母體要跟著換（兩個母體 UV 不同）
        meta = {**(model.get("meta") or {}), "seconds": secs, "albedo_size": list(tex.size), "mother": mother.folder.name,
                "prev_base_version": old_base}
        if job.get("body_type"):
            sb.upsert("meow_cat_model_variants", {
                "model_id": model_id, "body_type": body, "albedo_path": new_path,
                "prev_albedo_path": old_current, "base_version": mother.version,
                "prev_base_version": old_base,
                "confirmed_albedo": variant.get("confirmed_albedo") if variant else None,
                "updated_at": now_iso()})
        sb.patch("meow_cat_models", {"id": f"eq.{model_id}"}, {
            "status": "ready", "albedo_path": new_path, "prev_albedo_path": old_current,
            "base_version": mother.version, "photo_view": view, "fill_pattern": fill, "meta": meta, "updated_at": now_iso()})
        if old_prev and old_prev != old_current:
            sb.remove(MODEL_BUCKET, old_prev)
        sb.patch("meow_cat_model_jobs", {"id": f"eq.{job['id']}"}, {"status": "done", "step": "完成", "finished_at": now_iso()})
        print(f"    完成（{mother.version}），{secs // 60} 分 {secs % 60} 秒 → {new_path}")
    except KeyboardInterrupt:
        # Ctrl+C：不標成失敗的話，這隻貓會永遠卡在「生成中」，網頁也不能重試
        fail_supabase_job(sb, job["id"], model_id, "worker 被中斷，請重試")
        raise
    except Exception as e:
        traceback.print_exc()
        # 給管理員看的訊息：不含路徑與金鑰
        msg = str(e).split("\n")[0][:200] if isinstance(e, RuntimeError) else f"{type(e).__name__}：產生失敗，請重試或換一張照片"
        fail_supabase_job(sb, job["id"], model_id, msg)
    finally:
        torch.cuda.empty_cache()


def fail_supabase_job(sb, job_id, model_id, msg):
    sb.patch("meow_cat_model_jobs", {"id": f"eq.{job_id}"}, {"status": "error", "step": "失敗", "error": msg, "finished_at": now_iso()})
    sb.patch("meow_cat_models", {"id": f"eq.{model_id}"}, {"status": "failed", "updated_at": now_iso()})


def recover_stale(sb, host):
    """上次在這台電腦被強制關掉（關視窗、當機）的任務還停在 running：標成失敗，網頁才能重試"""
    for job in sb.select("meow_cat_model_jobs", status="eq.running", worker_id=f"like.{host}-*", select="id,model_id"):
        fail_supabase_job(sb, job["id"], job["model_id"], "worker 上次沒有正常結束，請重試")
        print(f"把上次中斷的任務標成失敗：{job['model_id']}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="處理完目前排隊的工作就結束")
    parser.add_argument("--supabase", action="store_true", help="從線上 MeowHQ（Supabase）領工作，而不是本機 adoption_cats")
    parser.add_argument("--env", default=str(DEFAULT_ENV), help="沒有環境變數時讀這個 .env 檔取 Supabase 金鑰")
    args = parser.parse_args()
    worker = Worker()
    if args.supabase:
        sb = Supabase(args.env)
        worker_id = f"{socket.gethostname()}-{os.getpid()}"
        recover_stale(sb, socket.gethostname())
        print(f"等待線上 MeowHQ 的上色工作…（{sb.url}，worker {worker_id}，Ctrl+C 結束）")
        while True:
            try:
                jobs = sb.select("meow_cat_model_jobs", status="eq.queued", order="queued_at.asc", select="*")
            except requests.RequestException as e:
                print(f"連不到 Supabase，稍後重試：{type(e).__name__}")
                jobs = []
            for job in jobs:
                run_supabase(worker, sb, job, worker_id)
            if args.once and not jobs:
                break
            time.sleep(3)
    else:
        # 本機只有這一個 worker：上次被強制關掉還停在 running 的，標成失敗才能重試
        for job in CATS_DIR.glob("*/paint_job.json") if CATS_DIR.is_dir() else []:
            if json.loads(job.read_text(encoding="utf-8")).get("status") == "running":
                write_job(job.parent, status="error", step="失敗", error="worker 上次沒有正常結束，請重試")
        print(f"等待 Cat Studio 的上色工作…（監看 {CATS_DIR}，Ctrl+C 結束）")
        while True:
            jobs = queued_local()
            for folder in jobs:
                run_local(worker, folder)
            if args.once and not jobs:
                break
            time.sleep(3)


if __name__ == "__main__":
    main()
