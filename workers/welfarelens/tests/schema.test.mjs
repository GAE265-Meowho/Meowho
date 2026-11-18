import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createScene,SceneSchema,ConditionSchema,CandidateSchema} from '../src/domain/schema.ts';
const object={id:'w',kind:'window',label:'窗',bbox:[.1,.1,.5,.5],status:'Observation',conditions:{}};
for(const bbox of [[-.1,0,.5,1],[.6,0,.2,1],[0,0,1.1,1]]) test(`annotation rejects invalid geometry ${bbox}`,()=>assert.equal(SceneSchema.safeParse({...createScene(),objects:[{...object,bbox}]}).success,false));
test('annotation rejects duplicate IDs and unsupported versions',()=>{
 assert.equal(SceneSchema.safeParse({...createScene(),objects:[object,object]}).success,false);
 assert.equal(SceneSchema.safeParse({...createScene(),version:2}).success,false);
});
test('unknown cannot carry a true value and improvement requires verification',()=>{
 assert.equal(ConditionSchema.safeParse({value:true,status:'Unknown'}).success,false);
 assert.equal(ConditionSchema.safeParse({value:true,status:'Verified Improvement'}).success,false);
});
test('annotations cannot inject model conditions or unknown property keys',()=>{
 assert.equal(CandidateSchema.safeParse({objects:[{kind:'plant',label:'植物',bbox:null,notes:'',conditions:{species:'Lilium species'}}],questions:[],limitations:[]}).success,false);
 assert.equal(SceneSchema.safeParse({...createScene(),objects:[{...object,conditions:{madeUp:{value:true,status:'Confirmation'}}}]}).success,false);
});
test('hypothesis cannot enter observed annotation scene',()=>assert.equal(SceneSchema.safeParse({...createScene(),objects:[{...object,status:'Hypothesis'}]}).success,false));
