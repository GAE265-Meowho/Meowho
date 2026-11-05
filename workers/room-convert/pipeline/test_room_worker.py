"""worker 轉換中出錯時的行為。用假的 room_demo.sh，幾秒跑完，不用 GPU。

  python3 -m unittest pipeline/test_room_worker.py
"""
import os
import sys
import tempfile
import textwrap
import time
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # 從專案根目錄跑也找得到 room_worker
import room_worker

# 依序寫出兩個步驟到 timing.json，讓 worker 回報進度；$MODE 決定之後怎麼結束
FAKE_DEMO = textwrap.dedent("""\
    #!/usr/bin/env bash
    mkdir -p "rooms/$2"
    sleep 30 &                       # 子程式：模擬 Brush、Python
    echo $! > child.pid
    echo '{"steps": [{"name": "重建"}]}' > "rooms/$2/timing.json"
    sleep 0.3
    echo '{"steps": [{"name": "重建"}, {"name": "切物品"}]}' > "rooms/$2/timing.json"
    if [[ "$MODE" == "fail" ]]; then sleep 0.3; touch finished; exit 1; fi
    sleep 30
    """)


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


class ConvertErrors(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        demo = self.root / "pipeline" / "room_demo.sh"
        demo.parent.mkdir()
        demo.write_text(FAKE_DEMO)
        demo.chmod(0o755)
        self.saved = room_worker.ROOT, room_worker.POLL_SECONDS
        room_worker.ROOT, room_worker.POLL_SECONDS = self.root, 0.05

    def tearDown(self):
        pid_file = self.root / "child.pid"
        if pid_file.exists() and alive(pid := int(pid_file.read_text())):
            os.kill(pid, 9)
        room_worker.ROOT, room_worker.POLL_SECONDS = self.saved
        os.environ.pop("MODE", None)
        self.tmp.cleanup()

    def convert(self, on_step):
        room_worker.convert(self.root / "video.mp4", "r1", on_step, self.root / "result", self.root / "worker.log")

    def test_network_error_while_reporting_does_not_stop_the_run(self):
        os.environ["MODE"] = "fail"
        steps = []
        def on_step(step):
            steps.append(step)
            raise urllib.error.URLError("Wi-Fi 斷線")
        # 轉換照常跑完，回報的是轉換本身的失敗，不是回報進度的網路錯誤
        with self.assertRaisesRegex(RuntimeError, "切物品失敗"):
            self.convert(on_step)
        self.assertTrue((self.root / "finished").exists())
        self.assertEqual(steps, ["抽影格", "重建", "切物品"])

    def test_other_error_stops_the_whole_run(self):
        def on_step(step):
            if step == "切物品":
                raise RuntimeError("後台壞了")
        with self.assertRaisesRegex(RuntimeError, "後台壞了"):
            self.convert(on_step)
        child = int((self.root / "child.pid").read_text())
        deadline = time.time() + 3
        while alive(child) and time.time() < deadline:
            time.sleep(0.05)
        self.assertFalse(alive(child), "轉換的子程式還在跑，會和下一個工作共用 input_frames")


class FakeSupabase:
    """記下 worker 打了哪些 API；GET 依路徑開頭回假資料。"""
    def __init__(self, rows):
        self.rows, self.calls = rows, []

    def rest(self, method, path, body=None, prefer=None):
        self.calls.append((method, path, body))
        if method == "GET":
            return next((v for k, v in self.rows.items() if path.startswith(k)), [])
        return [{}] if prefer else None

    def download(self, bucket, path, target):
        self.calls.append(("download", bucket, path))
        target.write_bytes(b"video")

    def upload(self, bucket, path, source):
        self.calls.append(("upload", bucket, path))

    def remove(self, bucket, path):
        self.calls.append(("remove", bucket, path))


class HomeRooms(unittest.TestCase):
    """前台我的 3D 房間：私有 bucket、通知喵戶長、環境報告好了才刪影片。"""
    HOME = "11111111-2222-3333-4444-555555555555"

    def run_job(self, ok, report_pending):
        sb = FakeSupabase({
            "meow_room_jobs?status=eq.queued": [{"id": "j1", "room_id": "room_20261104_120000"}],
            "meow_room_models?id=eq.room_20261104_120000&select": [{"video_path": f"{self.HOME}/v.mp4", "meta": {}, "owner_household_id": self.HOME}],
            "meow_households": [{"owner_id": "u1"}],
            "meow_env_reports": [{"id": "r1"}] if report_pending else [],
        })

        def fake_convert(video, room_id, on_step, result, log_path):
            if not ok:
                raise RuntimeError("重建失敗")
            result.mkdir(parents=True)
            (result / "scene.json").write_text('{"objects": [{"label": "bed"}, {"label": "bed"}, {"label": "lamp"}]}')

        old = room_worker.convert
        room_worker.convert = fake_convert
        try:
            room_worker.run_next_supabase(sb)
        finally:
            room_worker.convert = old
        return sb.calls

    def test_ready_uploads_privately_and_waits_for_report(self):
        calls = self.run_job(ok=True, report_pending=True)
        self.assertIn(("download", "meow-home-videos", f"{self.HOME}/v.mp4"), calls)
        self.assertIn(("upload", "meow-home-scenes", f"{self.HOME}/room_20261104_120000/scene.json"), calls)
        ready = next(b for m, p, b in calls if m == "PATCH" and b and b.get("status") == "ready")
        self.assertEqual(ready["result_path"], f"{self.HOME}/room_20261104_120000")
        self.assertEqual(ready["meta"]["objects"], [{"label": "床"}, {"label": "lamp"}])
        self.assertNotIn("video_path", ready)
        note = next(b for m, p, b in calls if m == "POST" and p == "meow_notifications")
        self.assertEqual((note["user_id"], note["link"]), ("u1", f"/homes/{self.HOME}/scene"))
        self.assertFalse([c for c in calls if c[0] == "remove"])  # 報告還沒好，影片留著

    def test_failed_deletes_video_when_report_done(self):
        calls = self.run_job(ok=False, report_pending=False)
        self.assertIn(("remove", "meow-home-videos", f"{self.HOME}/v.mp4"), calls)
        self.assertTrue(any(m == "PATCH" and b and b.get("raw_deleted_at") for m, p, b in calls))
        note = next(b for m, p, b in calls if m == "POST" and p == "meow_notifications")
        self.assertEqual(note["type"], "home_room_failed")


if __name__ == "__main__":
    unittest.main()
