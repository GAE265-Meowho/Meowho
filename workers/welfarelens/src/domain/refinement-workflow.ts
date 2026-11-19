import {CandidateSchema} from './schema.ts';
import type {Candidate} from './schema.ts';
import {needsPlantRefinement,mergePlantRefinement} from './plant-refinement.ts';
import {buildScanResult} from './scan-result.ts';
export type RefinementReport={object_index:number;status:'completed'|'failed'|'no_location';durationMs?:number};
/** Bounded attempts, no retry, at most two concurrent Azure calls. No browser dependency. */
export async function refinePlants(raw:Candidate, refine:(index:number)=>Promise<Candidate>, signal:AbortSignal,onResult?:(candidate:Candidate)=>void) {
    signal.throwIfAborted();
    let candidate=CandidateSchema.parse(raw),cursor=0;
    const queue=needsPlantRefinement(candidate);
    const reports:RefinementReport[]=buildScanResult(candidate).plants.filter(p=>p.status==='UNKNOWN'&&!candidate.objects[p.object_index].bbox).map(p=>({object_index:p.object_index,status:'no_location'}));
    async function worker(){while(cursor<queue.length){
        signal.throwIfAborted();const index=queue[cursor++],start=performance.now();
        try{const crop=await refine(index);signal.throwIfAborted();candidate=mergePlantRefinement(candidate,index,crop);reports.push({object_index:index,status:'completed',durationMs:performance.now()-start});onResult?.(candidate);}
        catch(e){signal.throwIfAborted();reports.push({object_index:index,status:'failed',durationMs:performance.now()-start});}
    }}
    await Promise.all([worker(),worker()]);signal.throwIfAborted();return {candidate,reports};
}
