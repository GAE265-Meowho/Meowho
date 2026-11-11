# 紋理貼圖 worker（paint_worker.py）

MeowHQ「產生紋理貼圖」的 GPU 工作程式：從 Supabase 的 `meow_cat_model_jobs` 領工作，用 Hunyuan3D-Paint 在骨架的固定 UV 上畫貼圖，上傳到 `meow-cat-models`。網站本身不跑這支程式；沒有 worker 在跑時，任務會一直「排隊中」。

## 內容
| 路徑 | 說明 |
|---|---|
| `cat_studio/paint_worker.py` | worker 主程式（已含 #104 成貓／幼貓變體補丁） |
| `cat_base/`、`cat_base_kitten/` | 成貓／幼貓骨架：`base_uv.glb`（固定 UV 網格）、`eyes.json`、`step3_paint.py`（沿用固定 UV）、`step3b_fill.py`（補看不到的花紋） |
| `cat_studio/project_views.py` | 選用（#365）：上色後把 AI 三視角（左側／正面／背部）投影到拉直後的成貓母體、烘焙進 `paint_albedo.png`，照片看不到的地方保留 Hunyuan 結果；用法見檔頭。需要 numpy、Pillow、trimesh，去背用 rembg 或 hy3dgen；尚未接進 `--supabase` 流程 |
| `setup_paint_worker.sh` | Azure VM 安裝腳本（Ubuntu 24.04＋Tesla T4） |

> 原始開發環境在 Tina 電腦的 `Meow/`（含 Blender 檔、建骨架用的其他腳本）。**之後改 worker 請改這裡**，改完同步回本機或直接在本機用這份。

## Azure VM 安裝（第一次）
```bash
git clone https://github.com/GAE265-Meowho/Meowho.git ~/Meowho   # private repo：先 gh auth login，或用 GitHub token 當密碼
bash ~/Meowho/workers/cat-paint/setup_paint_worker.sh             # 約 20～30 分鐘
nano ~/Meowho/workers/cat-paint/worker.env                        # 填 NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY
sudo systemctl restart meow-paint
journalctl -u meow-paint -f                                       # 看 worker 狀態，Ctrl+C 離開不影響 worker
```
- VM 開機後 worker 自動啟動（systemd `meow-paint`）。第一個任務會先下載 Hunyuan3D 模型（數 GB）。
- `worker.env`、`venv/`、`Hunyuan3D-2/` 不進 git（`.gitignore`）。

## 更新
```bash
cd ~/Meowho && git pull && sudo systemctl restart meow-paint
```

## 注意
- **成貓、幼貓一對**：網站排第一筆時把另一個體型記在 `meow_cat_models.meta.auto_paint`，worker 做完一筆才排下一筆（同一隻貓同時只能有一筆任務）。舊版 worker 不會接著排，改版後請 `git pull` 並重啟 worker。
- **同時只能有一個 paint worker**：VM 的 worker 在跑時，不要在本機再開 `paint_worker.py --supabase`。
- **T4 只有 16 GB**：和房間 worker（`workers/room-convert`）共用同一台 VM 時，兩邊用檔案鎖 `/tmp/meowho-gpu.lock`（`fcntl.LOCK_EX`）輪流領工作；等鎖期間工作維持 `queued`，不會卡在 `running`（#200）。
- `/mnt` 是 Azure 暫存磁碟，停止 VM 會清空；本 worker 全部裝在 repo 資料夾內。
- 用完在 Azure Portal 按「停止」（已解除配置）才不計 VM 費用；只在 Linux 內關機仍會計費。
