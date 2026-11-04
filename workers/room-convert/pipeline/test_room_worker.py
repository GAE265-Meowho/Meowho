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


if __name__ == "__main__":
    unittest.main()
