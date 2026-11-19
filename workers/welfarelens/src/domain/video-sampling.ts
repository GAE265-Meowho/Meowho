/** Production remains 90 seconds until coverage/AI gates pass. 180 is an explicit offline experiment. */
export function videoProbeLimit(seconds=90){if(!Number.isFinite(seconds)||seconds<.3||seconds>180)throw Error('Invalid experimental duration');return seconds;}
/** Keep the previous short-video candidate stream byte-for-byte; cover the tail of longer experiments. */
export function candidateFrameLimit(duration:number){if(!Number.isFinite(duration)||duration<=0||duration>180)throw Error('Invalid duration');return Math.max(91,Math.ceil(duration)+1);}

/** Offline candidates only; not used by the production worker. Return original decoded PTS. */
export function compareSampling<T extends {timestamp:number;novelty:number;sharpness:number}>(frames:T[],duration:number,limit=8){
 if(!Number.isFinite(duration)||duration<=0||duration>180||!Number.isInteger(limit)||limit<2||limit>32||frames.some((f,i)=>!Number.isFinite(f.timestamp)||f.timestamp<0||f.timestamp>=duration||!Number.isFinite(f.novelty)||f.novelty<0||!Number.isFinite(f.sharpness)||f.sharpness<0||(i>0&&f.timestamp<=frames[i-1].timestamp)))throw Error('Invalid sampling candidates');
 const uniform:T[]=[],windowed_change:T[]=[];
 for(let n=0;n<limit;n++){
  const bin=frames.filter(f=>f.timestamp>=n*duration/limit&&f.timestamp<(n+1)*duration/limit);if(!bin.length)continue;
  const middle=(n+.5)*duration/limit;
  uniform.push([...bin].sort((a,b)=>Math.abs(a.timestamp-middle)-Math.abs(b.timestamp-middle)||a.timestamp-b.timestamp)[0]);
  // Relative detail and change within each window; not object detection or a safety score.
  const sharp=Math.max(1,...bin.map(f=>f.sharpness));
  windowed_change.push([...bin].sort((a,b)=>(b.novelty+.35*b.sharpness/sharp)-(a.novelty+.35*a.sharpness/sharp)||Math.abs(a.timestamp-middle)-Math.abs(b.timestamp-middle)||a.timestamp-b.timestamp)[0]);
 }
 return {uniform,windowed_change};
}

/** Offline PoC. Greedy coverage by visual distance, with a small preference for
 * sharper representatives. Distance measures image appearance, not room identity. */
export function adaptiveViewSamples<T extends {timestamp:number;sharpness:number;pixels:Uint8Array}>(
 frames:T[],{maxFrames=12,minDistance=.115}:{maxFrames?:number;minDistance?:number}={},
):T[]{
 if(!Number.isInteger(maxFrames)||maxFrames<1||maxFrames>32||!Number.isFinite(minDistance)||minDistance<=0||minDistance>1)throw Error('Invalid adaptive bounds');
 if(!frames.length)return [];
 const size=frames[0].pixels.length;
 if(!size||frames.some(f=>f.pixels.length!==size))throw Error('Inconsistent candidate images');
 const distance=(a:T,b:T)=>{
  let difference=0;
  for(let i=0;i<size;i++)difference+=Math.abs(a.pixels[i]-b.pixels[i]);
  return difference/(255*size);
 };
 const ordered=[...frames].sort((a,b)=>a.timestamp-b.timestamp);
 const sharpest=Math.max(1,...ordered.map(f=>f.sharpness));
 const anchor=ordered[0];
 const selected=[anchor];
 const candidates=ordered.filter(f=>f!==anchor).map(frame=>({frame,nearest:distance(frame,anchor)}));
 const add=(next:typeof candidates[number])=>{
  selected.push(next.frame);
  for(const item of candidates)item.nearest=Math.min(item.nearest,distance(item.frame,next.frame));
 };
 const bins=Math.min(8,maxFrames);
 const duration=ordered.at(-1)!.timestamp-anchor.timestamp;
 if(duration>0)for(let bin=0;bin<bins&&selected.length<maxFrames;bin++){
  const next=candidates.filter(c=>c.nearest>=minDistance&&Math.min(bins-1,Math.floor((c.frame.timestamp-anchor.timestamp)*bins/duration))===bin)
   .sort((a,b)=>b.frame.sharpness-a.frame.sharpness||b.nearest-a.nearest)[0];
  if(next)add(next);
 }
 while(selected.length<maxFrames){
  const next=candidates.filter(c=>c.nearest>=minDistance).sort((a,b)=>
   (b.nearest-a.nearest)+.035*(b.frame.sharpness-a.frame.sharpness)/sharpest||a.frame.timestamp-b.frame.timestamp,
  )[0];
  if(!next)break;
  add(next);
 }
 return selected.sort((a,b)=>a.timestamp-b.timestamp);
}
