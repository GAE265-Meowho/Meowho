"""python3 -m unittest pipeline/test_fit_furniture.py（在 workers/room-convert 底下跑）"""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from fit_furniture import fit_rect, solid_core, trim_sparse


def block(x0, x1, z0, z1, y0, y1, n, rng):
    return np.stack([rng.uniform(x0, x1, n), rng.uniform(y0, y1, n), rng.uniform(z0, z1, n)], 1)


class SolidCore(unittest.TestCase):
    def test_drops_floor_and_wall_leaks(self):
        rng = np.random.default_rng(0)
        bed = block(0.5, 2.1, 1.0, 3.0, 0.0, 0.45, 40000, rng)        # 1.6 × 2.0 m，面高 0.45
        floor = block(-0.2, 0.5, 1.0, 2.0, 0.0, 0.03, 4000, rng)       # 床邊漏切的地板
        wall = block(0.5, 2.1, 3.3, 3.4, 0.0, 1.0, 3000, rng)         # 牆外的牆面
        q = np.concatenate([bed, floor, wall])
        bounds = {"min": [-1.0, -1.0], "max": [5.0, 3.2], "yaw": 0.0}
        _, _, w, d, _ = fit_rect(trim_sparse(solid_core(q, bounds)))
        self.assertAlmostEqual(w, 1.6, delta=0.1)
        self.assertAlmostEqual(d, 2.0, delta=0.1)


if __name__ == "__main__":
    unittest.main()
