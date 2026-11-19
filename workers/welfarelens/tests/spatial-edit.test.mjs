import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {buildSpatialEdit,makeRegionMask} from '../src/server/video/spatial-edit.ts';

const action={action_id:'tray',title:'收起托盤',kind:'conditional_prevention',instruction:'移除床上的托盤',expected_visible_change:'床上沒有托盤',region:[.25,.25,.75,.75]};
const view={actions:[action],elements_to_preserve:['保留床鋪'],unverified_conditions:['確認動線']};

test('paired prompts preserve actions and reject conflicting regions',()=>{
 const a=buildSpatialEdit(view,'text');
 const b=buildSpatialEdit(view,'mask');
 assert.match(a,/移除床上的托盤/);
 assert.ok(b.startsWith(a));
 assert.throws(()=>buildSpatialEdit({...view,actions:[action,{...action,action_id:'other'}]},'mask'),/重疊/);
 assert.throws(()=>buildSpatialEdit({...view,actions:[{...action,region:[0,0,2,1]}]},'mask'));
});

test('mask retains source dimensions and exposes only the selected pixels',()=>{
 const png=makeRegionMask(4,4,[action.region]);
 assert.equal(png.readUInt32BE(16),4);
 assert.equal(png.readUInt32BE(20),4);
 const length=png.readUInt32BE(33);
 const raw=inflateSync(png.subarray(41,41+length));
 assert.equal(raw[4],255);
 assert.equal(raw[17+8],0);
 assert.equal(raw[3*17+16],255);
});

test('only the region-guided request includes a multipart PNG mask',async()=>{
 const {editAzureImage}=await import('../src/server/image-edit-client.ts');
 const config={deployment:'test',url:'https://test.invalid',key:'fixture'};
 const mask=makeRegionMask(4,4,[action.region]);
 for(const guide of [undefined,mask]){
  const request=async (_url,{body})=>{
   assert.equal(body.has('mask'),Boolean(guide));
   if(guide)assert.deepEqual(Buffer.from(await body.get('mask').arrayBuffer()),mask);
   assert.equal(body.get('quality'),'high');
   return new Response(null,{status:429});
  };
  assert.deepEqual(await editAzureImage(config,Buffer.from('fixture'),buildSpatialEdit(view,guide?'mask':'text'),'1536x864',AbortSignal.timeout(1000),request,'high',guide),{ok:false,status:429});
 }
});
