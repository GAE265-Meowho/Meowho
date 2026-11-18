import {test} from 'node:test';import assert from 'node:assert/strict';
import {CandidateSchema} from '../src/domain/schema.ts';
const plant={kind:'plant',label:'植物',bbox:[.1,.1,.3,.5],notes:'葉片可見'};
const identification={object_index:0,candidates:[{common_name:'黃金葛',scientific_name:'Epipremnum aureum',confidence:'high'}],features:'心形葉片與黃斑',identification_quality:'adequate'};
test('plant hypotheses are accepted without promoting them to confirmations',()=>{const c=CandidateSchema.safeParse({objects:[plant],questions:[],limitations:[],plants:[identification],image_quality:'adequate'});assert.equal(c.success,true);});
test('plant candidates reject wrong references, duplicate pots and uncalibrated numerical confidence',()=>{for(const plants of [[{...identification,object_index:1}],[identification,identification],[{...identification,candidates:[{...identification.candidates[0],confidence:.99}]}]])assert.equal(CandidateSchema.safeParse({objects:[plant],questions:[],limitations:[],plants,image_quality:'adequate'}).success,false);});
