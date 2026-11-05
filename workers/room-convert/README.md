# 房間轉換 worker（room_worker.py）

MeowHQ「室內空間」的轉換程式：從 Supabase 的 `meow_room_jobs` 領工作，下載影片，重建成 3D 房間（3D Gaussian Splatting）、切出家具和小物，把成果傳到 `meow-room-models`。網站本身不跑這支程式；沒有 worker 在跑時，任務會一直「排隊中」。

```
影片 ─▶ 抽影格 ─▶ COLMAP 4 global_mapper 定位相機 ─▶ Brush 訓練 ─▶ 切物品（Grounding DINO + SAM 2）
     ─▶ 家具外框與分層碰撞 ─▶ 拆可動小物 ─▶ scene.json ─▶ 上傳
```

## 內容
| 路徑 | 說明 |
|---|---|
| `pipeline/room_worker.py` | worker 主程式（Supabase 模式、本機資料夾模式） |
| `pipeline/room_demo.sh` | 一支影片跑完整流程，結果在 `rooms/<名稱>/` |
| `pipeline/run_pipeline.sh` | 重建：抽影格 → 相機定位 → 訓練 |
| `pipeline/*.py` | 各步驟（切物品、家具外框、場景輸出等） |
| `assets/furniture/` | 家具網格模型（`build_scene.py` 會用到） |

> **這裡是正本**（2026-11-05 起）。珮瑜電腦的 `3Dtest/` 只做實驗（含檢視器與實驗檔），改好要搬回這裡。

## 安裝（macOS / Apple Silicon）
```bash
brew install colmap ffmpeg                                  # COLMAP 需 4.x（內建 global_mapper）
conda create -n gs python=3.11 -y && conda activate gs      # Open3D 尚不支援 Python 3.13+
pip install -r requirements.txt torch torchvision "transformers>=4.56"
```
- Brush 0.3.0：從 https://github.com/ArthurBrussee/brush/releases 下載，放到 `tools/brush_app`（或設 `BRUSH_BIN`）。
- 第一次切物品會自動下載 Grounding DINO、SAM 2 模型；第一次定位相機會下載約 70 MB 詞彙樹。
- `room_demo.sh` 預設用 `/opt/miniconda3/envs/gs/bin/python`，找不到就用 `python3`；其他位置用 `PYTHON=` 指定。

## 啟動 worker
在這個資料夾建 `.env.worker`（不進 git，權限設 600）：
```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=            # AI 辨識房間有哪些物品，必填
```
```bash
cd workers/room-convert
caffeinate -i python3 pipeline/room_worker.py --supabase    # 開著終端機分頁，Ctrl+C 結束
```
- M4 一支 80 秒影片約 17～20 分鐘；轉換時 CPU／GPU 吃滿，電腦睡眠會暫停。
- 成功後刪除原始影片、影格與中間檔；失敗時保留雲端影片，可把狀態改回 `queued` 重試。
- 成果路徑用隨機名稱（bucket 是公開的）。

## 只在本機轉一支影片
```bash
pipeline/room_demo.sh 影片.mp4 房間名稱
```
結果在 `rooms/<名稱>/`。物品清單在 `pipeline/catalog.py`（描述、類型、材質寫死），AI 只勾選房間有哪幾樣。

測試：`python3 pipeline/test_room_worker.py`

## 注意
- 只有完整品質（房間每秒 3 張影格、訓練 7000 步），2026-11-03 起刪除快速模式。
- 不要提交 `rooms/`、影片、影格、`.ply`／`.splat`、`.env.worker`（已在 `.gitignore`）。
- Azure VM（Linux）尚未驗證；VM 目前跑貓咪貼圖 worker，T4 不要同時跑兩種。
