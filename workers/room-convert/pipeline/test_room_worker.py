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


class FakeBlob:
    def __init__(self, calls):
        self.calls = calls

    def download(self, path, target):
        self.calls.append(("azure", path, None))
        target.write_bytes(b"video")


class HomeRooms(unittest.TestCase):
    """前台我的 3D 房間：影片從 Azure 讀、成果放私有 bucket、通知喵戶長、影片不刪（#273）。"""
    HOME = "11111111-2222-3333-4444-555555555555"
    PATH = f"homes/{HOME}/videos/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4"

    def run_job(self, ok, blob=True, check=None):
        sb = FakeSupabase({
            "meow_room_jobs?status=eq.queued": [{"id": "j1", "room_id": "room_20261104_120000"}],
            "meow_room_models?id=eq.room_20261104_120000&select": [{"video_path": self.PATH, "meta": {}, "owner_household_id": self.HOME}],
            "meow_households": [{"owner_id": "u1"}],
        })

        def fake_convert(video, room_id, on_step, result, log_path):
            if not ok:
                raise RuntimeError("重建失敗")
            result.mkdir(parents=True)
            (result / "scene.json").write_text('{"objects": [{"label": "bed"}, {"label": "bed"}, {"label": "lamp"}]}')

        old = room_worker.convert, room_worker.check_home_video
        room_worker.convert = fake_convert
        room_worker.check_home_video = check or (lambda video: None)
        try:
            room_worker.run_next_supabase(sb, FakeBlob(sb.calls) if blob else None)
        finally:
            room_worker.convert, room_worker.check_home_video = old
        return sb.calls

    def failed_error(self, calls):
        return next(b for m, p, b in calls if m == "PATCH" and b and b.get("status") == "error")["error"]

    def test_ready_reads_azure_uploads_privately_keeps_video(self):
        calls = self.run_job(ok=True)
        self.assertIn(("azure", self.PATH, None), calls)
        self.assertFalse([c for c in calls if c[0] == "download"])  # 不碰 Supabase 的影片 bucket
        self.assertIn(("upload", "meow-home-scenes", f"{self.HOME}/room_20261104_120000/scene.json"), calls)
        ready = next(b for m, p, b in calls if m == "PATCH" and b and b.get("status") == "ready")
        self.assertEqual(ready["result_path"], f"{self.HOME}/room_20261104_120000")
        self.assertEqual(ready["meta"]["objects"], [{"label": "床"}, {"label": "lamp"}])
        self.assertNotIn("video_path", ready)
        note = next(b for m, p, b in calls if m == "POST" and p == "meow_notifications")
        self.assertEqual((note["user_id"], note["link"]), ("u1", f"/homes/{self.HOME}/scene"))
        self.assertFalse([c for c in calls if c[0] == "remove"])

    def test_failed_notifies_and_keeps_video(self):
        calls = self.run_job(ok=False)
        self.assertFalse([c for c in calls if c[0] == "remove"])
        self.assertFalse(any(m == "PATCH" and b and "raw_deleted_at" in b for m, p, b in calls))
        note = next(b for m, p, b in calls if m == "POST" and p == "meow_notifications")
        self.assertEqual(note["type"], "home_room_failed")

    def test_video_check_failure_fails_job(self):
        def too_long(video):
            raise RuntimeError("影片超過 180 秒")
        calls = self.run_job(ok=True, check=too_long)
        self.assertEqual(self.failed_error(calls), "影片超過 180 秒")

    def test_without_azure_config_fails_clearly(self):
        calls = self.run_job(ok=True, blob=False)
        self.assertIn("Azure", self.failed_error(calls))


class CheckHomeVideo(unittest.TestCase):
    def test_rejects_wrong_format_and_unreadable(self):
        with tempfile.TemporaryDirectory() as d:
            webm = Path(d) / "v.webm"
            webm.write_bytes(b"x")
            with self.assertRaisesRegex(RuntimeError, "mp4"):
                room_worker.check_home_video(webm)
            bad = Path(d) / "v.mp4"
            bad.write_bytes(b"not a video")
            with self.assertRaisesRegex(RuntimeError, "讀不到"):
                room_worker.check_home_video(bad)


if __name__ == "__main__":
    unittest.main()
