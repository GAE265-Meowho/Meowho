"""Local QA only: label the actual source-PTS frames; does not infer objects or call models."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path('private-eval/real-mov')
r=json.loads((root/'results.json').read_text(encoding='utf-8'))
font=ImageFont.truetype('C:/Windows/Fonts/msjh.ttc',19)
small=ImageFont.truetype('C:/Windows/Fonts/msjh.ttc',15)
canvas=Image.new('RGB',(1600,1150),'#fbf5ea');d=ImageDraw.Draw(canvas)
d.text((24,12),'真實 MOV｜離線採樣比較（非 Azure 分析）',font=font,fill='#3f2e24')
d.text((24,44),'38.365 秒 · 原片 1920×1080／旋轉 -90° · 每種策略 8 張',font=small,fill='#7a6252')
for row,(name,frames) in enumerate(r['strategies'].items()):
    y=90+row*350;d.text((20,y),name,font=font,fill='#3f2e24')
    for col,f in enumerate(frames):
        t=f['timestamp'];im=Image.open(root/f'at-{t:.3f}.jpg');im.thumbnail((184,284));x=col*200+8
        canvas.paste(im,(x+(184-im.width)//2,y+35));d.text((x,y+322),f'{t:.3f}s',font=small,fill='#3f2e24')
canvas.save(root/'storyboard.png')
timeline=Image.open(root/'timeline.jpg');d=ImageDraw.Draw(timeline)
for n,f in enumerate(r['candidates']):
    x=(n%8)*180;y=(n//8)*320;d.rectangle((x,y,x+100,y+24),fill='#3f2e24');d.text((x+4,y+2),f"{f['timestamp']:.2f}s",font=small,fill='white')
timeline.save(root/'timeline-labelled.jpg',quality=92)
