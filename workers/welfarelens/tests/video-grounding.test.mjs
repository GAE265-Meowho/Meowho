import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RegionSchema,visibleRegions,boxIoU,evaluateBoxes} from '../src/domain/video-grounding.ts';
const frame={frame_id:'f0',sha256:'a'.repeat(64),width:1440,height:810,pts_seconds:0};
const context={frame,issue_id:'i0',observation_id:'o0',enabled:true,fixtureMode:false};
const region=(patch={})=>({version:1,id:'r0',frame,issue_id:'i0',observation_id:'o0',label:'線材',bbox:[.2,.1,.3,.4],coordinate_space:'autorotated_jpeg_xyxy01',provider:{name:'fixture',revision:'test-v1'},review:{status:'candidate',method:'none',reviewer:null,reference:null},...patch});
const approved=()=>region({review:{status:'accepted',method:'human_visual_review',reviewer:'reviewer-1',reference:'review-log-1'}});
test('only reviewed exact-frame regions render; default disabled and candidates rejected',()=>{
 assert.equal(visibleRegions([approved()],{...context,enabled:false}).length,0);
 assert.equal(visibleRegions([region()],context).length,0);
 assert.equal(visibleRegions([approved()],context).length,1);
 assert.equal(visibleRegions([region({review:{status:'accepted',method:'model_confidence',reviewer:'model',reference:'score'}})],context).length,0);
});
test('wrong frame hash, dimensions, timestamp, issue or observation never borrows a box',()=>{
 for(const changed of [{sha256:'b'.repeat(64)},{width:810,height:1440},{frame_id:'f1'},{pts_seconds:.001}])assert.equal(visibleRegions([approved()],{...context,frame:{...frame,...changed}}).length,0);
 for(const key of ['issue_id','observation_id'])assert.equal(visibleRegions([approved()],{...context,[key]:'other'}).length,0);
});
test('fixture checks require explicit opt-in and cannot become human review',()=>{
 const r=region({review:{status:'accepted',method:'agent_fixture_visual_check',reviewer:'AI-agent',reference:'draft-1'}});
 assert.equal(visibleRegions([r],context).length,0);assert.equal(visibleRegions([r],{...context,fixtureMode:true}).length,1);
 assert.equal(RegionSchema.safeParse(region({review:{status:'accepted',method:'none',reviewer:null,reference:null}})).success,false);
});
test('invalid boxes, unknown versions, nonfinite and malformed entries fail closed',()=>{
 for(const bbox of [[.3,.1,.2,.4],[-.1,0,.3,.4],[0,0,1,Infinity],[0,0,0,1]])assert.equal(RegionSchema.safeParse(region({bbox})).success,false);
 assert.equal(RegionSchema.safeParse(region({version:2})).success,false);
 assert.equal(visibleRegions([null,{},region({bbox:[0,0,1,2]})],context).length,0);
});
test('IoU geometry and one-to-one matching penalize duplicates, wrong pots and absent targets',()=>{
 assert.equal(boxIoU([0,0,1,1],[0,0,1,1]),1);assert.equal(boxIoU([0,0,.2,.2],[.3,.3,1,1]),0);
 const gt=[{frame_id:'f0',label:'plant',bbox:[0,0,.2,.8]},{frame_id:'f0',label:'plant',bbox:[.6,0,.9,.8]}];
 const out=evaluateBoxes(gt,[gt[0],gt[0],{frame_id:'negative',label:'plant',bbox:[0,0,1,1]}],.5);
 assert.equal(out.tp,1);assert.equal(out.fp,2);assert.equal(out.fn,1);assert.equal(out.precision,1/3);assert.equal(out.recall,.5);assert.equal(out.meanMatchedIoU,1);
 assert.equal(evaluateBoxes(gt,[{...gt[0],label:'cord'}],.5).tp,0);
});
test('unrun differs from completed empty detection; no predictions is not perfect precision',()=>{
 assert.equal(evaluateBoxes([],null,.5).precision,null);assert.equal(evaluateBoxes([],null,.5).status,'not_run');
 const result=evaluateBoxes([{frame_id:'f0',label:'cord',bbox:[0,0,1,1]}],[],.5);
 assert.equal(result.status,'measured');assert.equal(result.precision,null);assert.equal(result.recall,0);assert.equal(result.fn,1);
 assert.throws(()=>evaluateBoxes([],[],0));
});
