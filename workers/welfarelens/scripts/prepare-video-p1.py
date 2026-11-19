"""Local-only evidence preparation. No network, model loading, or source writes."""
import argparse, hashlib, json, pathlib, re, subprocess, time
from PIL import Image, ImageDraw

parser=argparse.ArgumentParser()
parser.add_argument('source',type=pathlib.Path)
args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'private-eval'/'video-p1'
out.mkdir(parents=True,exist_ok=True)
source=args.source.resolve(strict=True)
source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
start=time.perf_counter()
probe=json.loads(subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,codec_name:format=duration','-of','json',str(source)],capture_output=True,text=True,encoding='utf-8',errors='replace',check=True).stdout)
# Actual selected decoder PTS are captured; times are not invented integer seek positions.
vf="select='isnan(prev_selected_t)+gte(t-prev_selected_t,2)+gte(t,13)*lt(prev_selected_t,13)',scale=1440:1440:force_original_aspect_ratio=decrease:force_divisible_by=2,showinfo"
result=subprocess.run(['ffmpeg','-hide_banner','-loglevel','info','-nostdin','-y','-threads','2','-i',str(source),'-map','0:v:0','-an','-vf',vf,'-fps_mode','vfr','-frames:v','8','-q:v','3','-threads','2',str(out/'frame-%02d.jpg')],capture_output=True,text=True,encoding='utf-8',errors='replace',check=True)
times=[float(t) for t in re.findall(r'\bn:\s*\d+\s+pts:\s*[-\d]+\s+pts_time:([\d.e+-]+)',result.stderr)]
frames=[]
for i,pts in enumerate(times,1):
    path=out/f'frame-{i:02d}.jpg'
    with Image.open(path) as im:
        width,height=im.size
    frames.append(dict(frame_id=f'p1-{i:02d}',file=path.name,pts_seconds=pts,width=width,height=height,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),origin='source_decoded_frame'))
# Target-negative derived crop: visibly blank wall in frame 1. Not a separate real camera view.
with Image.open(out/'frame-01.jpg') as im:
    crop=im.crop((740,120,920,280)); crop.save(out/'negative-wall.jpg',quality=95)
frames.append(dict(frame_id='negative-wall',file='negative-wall.jpg',pts_seconds=times[0],width=180,height=160,sha256=hashlib.sha256((out/'negative-wall.jpg').read_bytes()).hexdigest(),origin='derived_crop',parent='p1-01',crop_pixels=[740,120,920,280]))
sheet=Image.new('RGB',(960,270*((len(frames)+1)//2)),'#f8f7f2')
for i,f in enumerate(frames):
    with Image.open(out/f['file']) as im:
        im.thumbnail((475,240)); x=(i%2)*480; y=(i//2)*270; sheet.paste(im,(x,y+24))
        ImageDraw.Draw(sheet).text((x+5,y+5),f"{f['frame_id']} PTS={f['pts_seconds']:.6f} {f['origin']}",fill='#222222')
sheet.save(out/'contact-sheet.jpg',quality=92)
manifest=dict(version=1,source_sha256=source_hash,probe=probe,frames=frames,preparation_seconds=time.perf_counter()-start,paid_calls=0,notes='Decoded PTS; no Azure output. Derived crop is not a real independent negative frame. No botanical truth implied.')
if hashlib.sha256(source.read_bytes()).hexdigest()!=source_hash: raise RuntimeError('Source changed')
(out/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(dict(frames=len(frames),preparation_seconds=manifest['preparation_seconds'],output=str(out),paid_calls=0)))
