"""Agent visual draft for these inspected frames; NOT human GT or model predictions."""
import json,pathlib,html
from PIL import Image,ImageDraw
root=pathlib.Path(__file__).resolve().parents[1]/'private-eval'/'video-p1'
m=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
# xyxy pixels on the decoded 1440x810 JPEG. Visible extent only; no occluded extent invented.
drafts={
 'p1-01':[('cord','shelf-black',[311,82,419,317],'thin'),('cord','shelf-white',[294,82,314,318],'low_contrast'),('shelf','wood-shelves',[0,0,700,100],'truncated'),('plant','foreground-leaf',[550,405,1440,810],'blurred_truncated')],
 'p1-02':[('cord','shelf-black',[527,83,625,315],'thin'),('cord','shelf-white',[508,82,530,315],'low_contrast'),('shelf','wood-shelves',[145,0,908,101],'truncated'),('plant','foreground-leaf',[737,419,1440,810],'blurred_truncated')],
 'p1-03':[('cord','shelf-black',[794,86,889,313],'thin'),('cord','shelf-white',[774,87,793,313],'low_contrast'),('shelf','wood-shelves',[438,0,1212,92],'truncated'),('plant','foreground-leaf',[1060,450,1440,810],'occluded_truncated')],
 'p1-04':[('cord','shelf-black',[1140,67,1247,313],'thin'),('cord','shelf-white',[1115,68,1135,313],'low_contrast'),('cord','lamp-cord',[66,175,100,634],'thin_occluded'),('shelf','wood-shelves',[527,0,1440,75],'truncated')],
 'p1-05':[('plant','upright-pot',[0,0,338,810],'truncated'),('cord','lamp-cord',[445,176,492,609],'thin_occluded')],
 'p1-06':[('plant','upright-pot',[420,0,701,810],'occluded_truncated'),('cord','lamp-cord',[806,183,857,620],'thin_occluded')],
 'p1-07':[('plant','upright-pot',[831,0,1114,797],'occluded_truncated'),('cord','lamp-cord',[1255,190,1314,648],'thin_occluded')],
 'p1-08':[('plant','upright-pot',[1035,0,1341,810],'occluded_truncated')],
 'negative-wall':[],
}
items=[]
for frame in m['frames']:
    boxes=[]
    im=Image.open(root/frame['file']).convert('RGB');draw=ImageDraw.Draw(im)
    for label,local_id,pixels,visibility in drafts[frame['frame_id']]:
        x1,y1,x2,y2=pixels; bbox=[x1/frame['width'],y1/frame['height'],x2/frame['width'],y2/frame['height']]
        boxes.append(dict(label=label,local_id=local_id,bbox=bbox,visibility=visibility))
        draw.rectangle(pixels,outline='#00a6a0',width=3);draw.text((x1,max(12,y1)),local_id,fill='white',stroke_width=1,stroke_fill='black')
    draw.rectangle((0,im.height-25,im.width,im.height),fill='#222222');draw.text((5,im.height-20),'AGENT DRAFT / NOT HUMAN GT / NOT MODEL OUTPUT',fill='white')
    im.save(root/f"draft-{frame['frame_id']}.jpg",quality=92)
    # Query-negative means only the specified class is absent, not the room is safe.
    absent=['plant','cord','shelf'] if frame['frame_id']=='negative-wall' else ['shelf'] if frame['frame_id'] in ['p1-05','p1-06','p1-07','p1-08'] else []
    items.append(dict(frame=frame,objects=boxes,negative_queries=absent))
out=dict(version=1,review_status='pending_human_review',annotator='AI-agent visual inspection of full-resolution local JPEGs',not_model_output=True,notes=['Visible extent only. No plant species/toxicity confirmed.','No simultaneous two-pot frame exists in this sample; two-pot identity is synthetic testing only.','Human corrections must remain a separate reviewed revision.'],items=items)
(root/'annotation-draft.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
# Explicit wrong-frame synthetic failure, for regression inspection only.
im=Image.open(root/'frame-03.jpg').convert('RGB');d=ImageDraw.Draw(im)
d.rectangle(drafts['p1-01'][0][2],outline='red',width=5)
d.text((10,40),'SYNTHETIC WRONG-FRAME BOX / MUST NOT DISPLAY',fill='red')
im.save(root/'failure-wrong-frame-synthetic.jpg',quality=92)
sections=[]
for item in items:
    frame=item['frame'];rows=''.join('<tr><td>'+html.escape(o['local_id'])+'</td><td>'+html.escape(o['visibility'])+'</td><td>'+html.escape(str(o['bbox']))+'</td></tr>' for o in item['objects'])
    sections.append(f"<section><h2>{frame['frame_id']} · {frame['pts_seconds']:.3f}s</h2><p>人工覆核：尚未完成。負例 query：{html.escape(', '.join(item['negative_queries']))}</p><div><img src='{frame['file']}' alt='原影格'><img src='draft-{frame['frame_id']}.jpg' alt='代理草標'><img src='lines-{frame['frame_id']}.jpg' alt='非語意線段候選'></div><table><tr><th>可見目標</th><th>影像限制</th><th>xyxy01</th></tr>{rows}</table></section>")
(root/'review.html').write_text("<!doctype html><html lang='zh-Hant'><meta charset='utf-8'><title>P1 本機定位覆核資料</title><style>body{font-family:system-ui;background:#fcfaf5;color:#244849;margin:24px}section{border-top:1px solid #bbb;padding:20px 0}section div{display:flex;flex-wrap:wrap;gap:12px}img{width:min(100%,460px);object-fit:contain}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;word-break:break-all}</style><h1>P1 本機定位覆核資料</h1><p>代理視覺草標，不是人類 Ground Truth，也不是 Azure／Florence／Grounding DINO 的輸出。右圖是幾何線段候選，不是電線偵測。請逐圖檢查目標、可見範圍、錯盆與負例，另存獨立覆核紀錄；本頁不會自動核准框。</p>"+''.join(sections)+"<h2>合成錯誤框負例</h2><p>把0秒座標套在4.004秒：此框必須被frame/hash閘門拒絕。</p><img src='failure-wrong-frame-synthetic.jpg' alt='明確標示的合成錯影格框'></html>",encoding='utf-8')
print(json.dumps(dict(frames=len(items),draft_boxes=sum(len(i['objects']) for i in items),human_reviewed=False,model_predictions=0)))
