import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {z} from 'zod';
import {BboxSchema} from '../src/domain/schema.ts';
import {evaluateBoxes,GroundingFrameSchema} from '../src/domain/video-grounding.ts';
const directory=join(process.cwd(),'private-eval/video-p1');
const frameSchema=GroundingFrameSchema.extend({file:z.string().regex(/^[a-zA-Z0-9-]+\.jpg$/),origin:z.enum(['source_decoded_frame','derived_crop']),parent:z.string().optional(),crop_pixels:z.array(z.number()).optional()});
const annotations=z.object({version:z.literal(1),review_status:z.literal('pending_human_review'),items:z.array(z.object({frame:frameSchema,objects:z.array(z.object({label:z.string(),local_id:z.string(),bbox:BboxSchema,visibility:z.string()})),negative_queries:z.array(z.string())}))}).parse(JSON.parse(await readFile(join(directory,'annotation-draft.json'),'utf8')));
for(const {frame} of annotations.items)if(createHash('sha256').update(await readFile(join(directory,frame.file))).digest('hex')!==frame.sha256)throw Error('Frame hash mismatch');
const truth=annotations.items.flatMap(({frame,objects})=>objects.map(o=>({frame_id:frame.frame_id,label:o.label,bbox:o.bbox})));
const lines=z.object({semantic_detector:z.literal(false),items:z.array(z.object({frame_id:z.string(),boxes:z.array(BboxSchema),runs_ms:z.array(z.number().nonnegative()),median_ms:z.number().nonnegative()}))}).parse(JSON.parse(await readFile(join(directory,'line-proposals.json'),'utf8')));
if(lines.items.length!==annotations.items.length||new Set(lines.items.map(i=>i.frame_id)).size!==lines.items.length||lines.items.some(i=>!annotations.items.some(a=>a.frame.frame_id===i.frame_id)))throw Error('Line proposal frame coverage mismatch');
const cordTruth=truth.filter(t=>t.label==='cord');
// Deliberately treat every geometric proposal as a cable candidate to expose false alerts.
// This is NOT a trained semantic detector comparison, and draft truth is not human-validated.
const proposalPredictions=lines.items.flatMap(i=>i.boxes.map(bbox=>({frame_id:i.frame_id,label:'cord',bbox})));
const diagnostic=[.3,.5].map(threshold=>({threshold,...evaluateBoxes(cordTruth,proposalPredictions,threshold)}));
const report={version:1,scope:'provisional geometry diagnostic against AI-agent draft, not human GT or model benchmark',frames:annotations.items.length,draft_objects:truth.length,paid_calls:0,
 models:['existing Azure VLM','microsoft/Florence-2-base-ft','IDEA-Research/grounding-dino-tiny','onnx-community/Florence-2-base-ft'].map(model=>({model,...evaluateBoxes(truth,null,.5),latency_ms:null,peak_memory_bytes:null,reason:'No cached predictions/weights; no download or paid inference authorized'})),
 geometric_proposals:{count:proposalPredictions.length,semantic_detector:false,diagnostic,frame_times:lines.items.map(({frame_id,runs_ms,median_ms})=>({frame_id,runs_ms,median_ms})),memory_peak_bytes:null},
 missing_coverage:['human-reviewed Ground Truth','simultaneous same-species two-pot real frame','real portrait video','full model bake-off','model inference latency/peak memory/cost']};
await writeFile(join(directory,'evaluation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,geometric_proposals:{count:proposalPredictions.length,diagnostic}},null,2));
