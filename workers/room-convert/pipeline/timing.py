#!/usr/bin/env python3
"""處理流程的計時紀錄：每一步的開始、結束、耗時，失敗也會留下。每次都立刻寫檔，中斷時紀錄不會不見。

  timing.py init  timing.json --video room.mp4 --name room3
  timing.py begin timing.json "02 等待重建" "Brush 訓練 splat"
  timing.py end   timing.json 0              （0 成功，其他數字是失敗的結束碼）
  timing.py set   timing.json iterations 4000
  timing.py finish timing.json --ply scene.ply --frames input_frames --scene scene.json
"""
import argparse
import json
import platform
import subprocess
import time
from datetime import datetime
from pathlib import Path


def stamp():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def load(path):
    return json.loads(Path(path).read_text())


def save(path, t):
    tmp = Path(str(path) + ".tmp")
    tmp.write_text(json.dumps(t, indent=2, ensure_ascii=False))
    tmp.replace(path)


def sysctl(key):
    try:
        return subprocess.run(["sysctl", "-n", key], capture_output=True, text=True, timeout=5).stdout.strip()
    except OSError:
        return ""


def machine():
    mem = sysctl("hw.memsize")
    return {"host": platform.node(), "os": platform.platform(), "cpu": sysctl("machdep.cpu.brand_string") or platform.processor(),
            "memory_gb": round(int(mem) / 2**30) if mem.isdigit() else None}


def video_info(path):
    """影片長度、解析度。讀不到（沒裝 OpenCV、照片資料夾）就留空。"""
    try:
        import cv2
        cap = cv2.VideoCapture(str(path))
        fps, n = cap.get(cv2.CAP_PROP_FPS), cap.get(cv2.CAP_PROP_FRAME_COUNT)
        w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()
        return {"duration_s": round(n / fps, 1), "resolution": f"{w}x{h}"} if fps > 0 and n > 0 and w > 0 else {}
    except Exception:
        return {}


def gaussians(ply):
    """只讀 PLY 檔頭，不用載入整個模型。"""
    try:
        with open(ply, "rb") as f:
            for line in f:
                if line.startswith(b"element vertex"):
                    return int(line.split()[-1])
                if line.startswith(b"end_header"):
                    break
    except OSError:
        pass
    return None


def report(t):
    print("\n======== 計時紀錄 ========")
    total = t["total_s"] or 1
    for s in t["steps"]:
        mark = "" if s["status"] == "ok" else f"  ← {s['status']}"
        print(f"{s['seconds']:>8.1f} 秒 {s['seconds'] / total * 100:>5.1f}%  {s['stage']} / {s['name']}{mark}")
    print(f"{t['total_s']:>8.1f} 秒        總耗時（步驟加總 {t['steps_total_s']:.1f} 秒，差 {t['gap_percent']:.1f}%）")


def main():
    ap = argparse.ArgumentParser(description="處理流程計時")
    ap.add_argument("cmd", choices=["init", "begin", "end", "set", "finish"])
    ap.add_argument("file", type=Path)
    ap.add_argument("args", nargs="*")
    ap.add_argument("--video")
    ap.add_argument("--name")
    ap.add_argument("--ply")
    ap.add_argument("--frames")
    ap.add_argument("--scene")
    a = ap.parse_args()

    if a.cmd == "init":
        a.file.parent.mkdir(parents=True, exist_ok=True)
        save(a.file, {"name": a.name, "status": "running", "started_at": stamp(), "started": time.time(), "finished_at": None,
                      "total_s": None, "machine": machine(), "input": {"video": a.video, **video_info(a.video)},
                      "settings": {}, "result": {}, "steps": []})
        return

    t = load(a.file)
    if a.cmd == "begin":
        stage, name = a.args
        t["steps"].append({"stage": stage, "name": name, "started_at": stamp(), "started": time.time(),
                           "finished_at": None, "seconds": None, "status": "running"})
        print(f"[計時] 開始 {name}，已花 {(time.time() - t['started']) / 60:.1f} 分鐘")
    elif a.cmd == "end":
        s = t["steps"][-1]
        s.update(finished_at=stamp(), seconds=round(time.time() - s["started"], 1),
                 status="ok" if a.args[0] == "0" else f"failed ({a.args[0]})")
        print(f"[計時] {s['name']}：{s['seconds']} 秒，{s['status']}")
    elif a.cmd == "set":
        t["settings"][a.args[0]] = a.args[1]
    elif a.cmd == "finish":
        for s in t["steps"]:  # 中斷時最後一步還沒結束
            if s["status"] == "running":
                s.update(finished_at=stamp(), seconds=round(time.time() - s["started"], 1), status="interrupted")
        t["finished_at"] = stamp()
        t["total_s"] = round(time.time() - t["started"], 1)
        t["steps_total_s"] = round(sum(s["seconds"] for s in t["steps"]), 1)
        t["gap_percent"] = round(abs(t["total_s"] - t["steps_total_s"]) / max(t["total_s"], 1e-6) * 100, 1)
        bad = [s for s in t["steps"] if s["status"] != "ok"]
        t["status"] = f"stopped at: {bad[0]['name']}" if bad else "ok"
        t["result"]["gaussians"] = gaussians(a.ply) if a.ply else None
        t["result"]["frames"] = len(list(Path(a.frames).glob("*.jpg"))) if a.frames and Path(a.frames).is_dir() else None
        if a.scene and Path(a.scene).exists():
            scene = json.loads(Path(a.scene).read_text())
            t["result"]["objects"] = len(scene["objects"])
            t["result"]["movable_objects"] = sum("splat" in o for o in scene["objects"])
        report(t)
    save(a.file, t)


if __name__ == "__main__":
    main()
