import {CandidateSchema, BboxSchema} from './schema.ts';
import type {Candidate} from './schema.ts';
import {buildScanResult} from './scan-result.ts';

/** Original decoded-image coordinates, with context; never infer a missing box. */
export function cropRegion(box: Candidate['objects'][number]['bbox'], width:number, height:number) {
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0) throw Error('Invalid image dimensions');
    if(!box) return null;
    const [l,t,r,b]=BboxSchema.parse(box), px=(r-l)*.12, py=(b-t)*.12;
    const x=Math.max(0,Math.floor((l-px)*width)), y=Math.max(0,Math.floor((t-py)*height));
    return {x,y,width:Math.min(width,Math.ceil((r+px)*width))-x,height:Math.min(height,Math.ceil((b+py)*height))-y};
}
export function needsPlantRefinement(raw:Candidate) {
    const candidate=CandidateSchema.parse(raw);
    return buildScanResult(candidate).plants.filter(p=>p.status==='UNKNOWN'&&candidate.objects[p.object_index].bbox!==null).map(p=>p.object_index);
}
/** Crop coordinates and crop findings NEVER replace full-scene geometry or evidence. */
export function mergePlantRefinement(raw:Candidate, index:number, rawCrop:Candidate):Candidate {
    const candidate=CandidateSchema.parse(raw),crop=CandidateSchema.parse(rawCrop);
    if(candidate.objects[index]?.kind!=='plant') throw Error('Unknown plant reference');
    const next=crop.plants?.length===1?crop.plants[0]:undefined;
    if(!next?.candidates.length||!next.features.trim()||next.identification_quality==='unusable') return candidate;
    const old=candidate.plants?.find(p=>p.object_index===index);
    // Do not replace a useful first-pass hypothesis with lower-detail evidence.
    if(old?.identification_quality==='adequate' && next.identification_quality!=='adequate') return candidate;
    // High-concern alternative cannot disappear merely because a second opinion omits it.
    const priorHigh=buildScanResult(candidate).plants.find(p=>p.object_index===index)?.highConcern;
    const proposed={...next,object_index:index};
    if(priorHigh) {
        const merged=[...proposed.candidates,...(old?.candidates??[]).filter(n=>/^(Lilium|Hemerocallis|Cycas)\s/i.test(n.scientific_name))];
        // Keep a possible severe alternative ahead of lower-risk alternatives.
        proposed.candidates=merged.filter((n,i,a)=>a.findIndex(x=>x.scientific_name.toLowerCase()===n.scientific_name.toLowerCase())===i).sort((a,b)=>Number(/^(Lilium|Hemerocallis|Cycas)\s/i.test(b.scientific_name))-Number(/^(Lilium|Hemerocallis|Cycas)\s/i.test(a.scientific_name))).slice(0,3);
    }
    return CandidateSchema.parse({...candidate,plants:[...(candidate.plants??[]).filter(p=>p.object_index!==index),proposed]});
}
