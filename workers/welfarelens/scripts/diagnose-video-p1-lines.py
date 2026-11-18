"""Actual CPU OpenCV geometric proposals. No semantics, model weights, or risk inference."""
import hashlib,json,pathlib,time,statistics
import cv2,numpy as np
root=pathlib.Path(__file__).resolve().parents[1]/'private-eval'/'video-p1'
manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
detector=cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
items=[]
for f in manifest['frames']:
    path=root/f['file']; raw=path.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=f['sha256']: raise RuntimeError('Changed frame')
    image=cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_COLOR)
    gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY); measurements=[]
    for _ in range(3):
        start=time.perf_counter();lines=detector.detect(gray)[0];measurements.append((time.perf_counter()-start)*1000)
    boxes=[]
    # OpenCV 4 uses Nx1x4; this machine's OpenCV 5 uses Nx4.
    for line in ([] if lines is None else lines.reshape(-1,4)):
        x1,y1,x2,y2=map(float,line)
        if np.hypot(x2-x1,y2-y1)<.03*min(f['width'],f['height']):continue
        box=[max(0,min(x1,x2)-3)/f['width'],max(0,min(y1,y2)-3)/f['height'],min(f['width'],max(x1,x2)+3)/f['width'],min(f['height'],max(y1,y2)+3)/f['height']]
        boxes.append(box)
    annotated=image.copy()
    for box in boxes:
        a,b,c,d=box;cv2.rectangle(annotated,(int(a*f['width']),int(b*f['height'])),(int(c*f['width']),int(d*f['height'])),(0,120,255),1)
    cv2.putText(annotated,'GEOMETRIC PROPOSALS / NOT CABLE DETECTIONS',(10,22),cv2.FONT_HERSHEY_SIMPLEX,.5,(0,0,255),1)
    ok,jpg=cv2.imencode('.jpg',annotated)
    if not ok: raise RuntimeError('Cannot encode diagnostic')
    (root/f"lines-{f['frame_id']}.jpg").write_bytes(jpg.tobytes())
    items.append(dict(frame_id=f['frame_id'],boxes=boxes,runs_ms=measurements,median_ms=statistics.median(measurements)))
out=dict(version=1,method='OpenCV LSD_REFINE_STD + length >= 3% min dimension + 3px padding',semantic_detector=False,opencv=cv2.__version__,device='CPU',paid_calls=0,memory_peak_bytes=None,items=items,notes='Diagnostic proposals only. Cannot identify cables, plants, toxicity or risks. No thresholds tuned on annotations.')
(root/'line-proposals.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print(json.dumps(dict(frames=len(items),proposals=sum(len(x['boxes']) for x in items),median_per_frame_ms=statistics.median(x['median_ms'] for x in items),paid_calls=0)))
