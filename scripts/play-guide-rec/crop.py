# 找出錄影裡小遊戲視窗的範圍（每秒取一格，和背景色不同的區域取聯集），印出 ffmpeg crop 參數
import subprocess, sys, os, glob
from PIL import Image
g = sys.argv[1]
OUT = os.environ.get("OUT", "/tmp/play-guide-rec")
d = f"{OUT}/cf_{g}"; os.makedirs(d, exist_ok=True)
for f in glob.glob(d + "/*.png"): os.remove(f)
subprocess.run(["ffmpeg","-v","error","-y","-i",f"{OUT}/{g}.webm","-vf","fps=1",f"{d}/%03d.png"],check=True)
x0,y0,x1,y1=9999,9999,0,0
for f in sorted(glob.glob(d+"/*.png")):
    im=Image.open(f).convert("RGB"); W,H=im.size; bg=im.getpixel((8,H//2)); px=im.load()
    def diff(p): return sum(abs(a-b) for a,b in zip(p,bg))>40
    xs=[x for x in range(0,W,2) if diff(px[x,H//2])]
    ys=[y for y in range(0,H,2) if diff(px[W//2,y])]
    if xs: x0=min(x0,xs[0]); x1=max(x1,xs[-1])
    if ys: y0=min(y0,ys[0]); y1=max(y1,ys[-1])
pad=6; x0=max(0,x0-pad); y0=max(0,y0-pad); x1=min(W,x1+pad); y1=min(H,y1+pad)
w=(x1-x0)//2*2; h=(y1-y0)//2*2
print(f"{w}:{h}:{x0}:{y0}")
