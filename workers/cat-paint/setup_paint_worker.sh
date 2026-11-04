#!/usr/bin/env bash
# Meowho 紋理貼圖 worker（paint_worker.py --supabase）安裝腳本
# 對象：Azure VM（Ubuntu 24.04、Tesla T4、NVIDIA 驅動已裝）
# 用法（Issue #169）：
#   git clone https://github.com/GAE265-Meowho/Meowho.git ~/Meowho
#   bash ~/Meowho/workers/cat-paint/setup_paint_worker.sh
# 可以重複執行：已完成的步驟會略過。venv、Hunyuan3D-2、worker.env 都放在這個資料夾（已加 .gitignore），不動其他目錄。
# 更新 worker：cd ~/Meowho && git pull && sudo systemctl restart meow-paint
set -euo pipefail

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$APP/venv"
CUDA_VER="12-8"
CUDA_HOME="/usr/local/cuda-12.8"
export TORCH_CUDA_ARCH_LIST="7.5"   # Tesla T4

step() { echo; echo "=== $* ==="; }

step "1/7 系統套件"
sudo apt-get update -y
sudo apt-get install -y build-essential git python3-venv python3-dev libgl1 libglib2.0-0 wget

step "2/7 CUDA 12.8 編譯工具（只裝 nvcc 等工具，不動驅動）"
# 系統內建的 nvcc 12.0 不支援 Ubuntu 24.04 的 gcc 13，編譯上色元件會失敗，所以另外裝 12.8
if [ ! -x "$CUDA_HOME/bin/nvcc" ]; then
  wget -q https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb -O /tmp/cuda-keyring.deb
  sudo dpkg -i /tmp/cuda-keyring.deb
  sudo apt-get update -y
  sudo apt-get install -y "cuda-toolkit-$CUDA_VER"
fi
export CUDA_HOME PATH="$CUDA_HOME/bin:$PATH"
nvcc --version | tail -1

step "3/7 確認 worker 檔案"
for f in cat_studio/paint_worker.py cat_base/work/base_uv.glb cat_base_kitten/work/base_uv.glb; do
  [ -f "$APP/$f" ] || { echo "缺少 $APP/$f，請確認 repo 是最新版（git pull）"; exit 1; }
done
echo "OK：$APP"

step "4/7 Python 環境與 PyTorch（CUDA 12.8）"
[ -d "$VENV" ] || python3 -m venv "$VENV"
# shellcheck disable=SC1091
source "$VENV/bin/activate"
pip install -U pip wheel "setuptools<80" ninja pybind11
# 版本與 Tina 電腦上可用的環境一致（torch 2.11.0+cu128）
python -c "import torch" 2>/dev/null || pip install "torch==2.11.0" torchvision --index-url https://download.pytorch.org/whl/cu128
python -c "import torch; print('torch', torch.__version__, 'GPU', torch.cuda.get_device_name(0))"

step "5/7 Hunyuan3D-2 與套件"
if [ ! -d "$APP/Hunyuan3D-2" ]; then
  git clone https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git "$APP/Hunyuan3D-2"
  git -C "$APP/Hunyuan3D-2" checkout f8db630   # 與 Tina 電腦同版（她本機唯一的修改是 Windows 編譯用，Linux 不需要）
fi
cd "$APP/Hunyuan3D-2"
pip install -r requirements.txt
# 鎖成 Tina 電腦上驗證過的版本
pip install "diffusers==0.35.2" "transformers==4.57.6" "accelerate==1.15.0" "huggingface_hub==0.36.2"
pip install -e .
pip install requests scipy

step "6/7 編譯上色要用的兩個元件（約 5～10 分鐘）"
python -c "import custom_rasterizer" 2>/dev/null || (cd hy3dgen/texgen/custom_rasterizer && pip install --no-build-isolation .)
(cd hy3dgen/texgen/differentiable_renderer && python setup.py install)
python -c "import custom_rasterizer; from hy3dgen.texgen import Hunyuan3DPaintPipeline; print('上色元件 OK')"

step "7/7 開機自動啟動 worker（systemd）"
ENV_FILE="$APP/worker.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
# 填好兩個值後存檔（這個檔只有你看得到，不要傳給別人）
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
EOF
  chmod 600 "$ENV_FILE"
fi
sudo tee /etc/systemd/system/meow-paint.service >/dev/null <<EOF
[Unit]
Description=Meowho 紋理貼圖 worker（paint_worker.py --supabase）
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$APP
Environment=PYTHONUNBUFFERED=1
ExecStart=$VENV/bin/python $APP/cat_studio/paint_worker.py --supabase --env $ENV_FILE
Restart=always
RestartSec=15

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable meow-paint >/dev/null

echo
echo "安裝完成。接下來："
echo "  1. nano $ENV_FILE   填入 Supabase 網址與 service role 金鑰"
echo "  2. sudo systemctl restart meow-paint"
echo "  3. journalctl -u meow-paint -f   看 worker 有沒有在等工作（Ctrl+C 離開，不影響 worker）"
