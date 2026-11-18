import {test} from 'node:test';import assert from 'node:assert/strict';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {loadTsx} from './helpers/load-tsx.mjs';
const Component=loadTsx('src/components/StaticEvidenceOverlay.tsx').default;
const frame={frame_id:'f0',sha256:'a'.repeat(64),width:1440,height:810,pts_seconds:0};
const region={version:1,id:'r0',frame,issue_id:'i0',observation_id:'o0',label:'沙發上方線材',bbox:[.2,.1,.3,.4],coordinate_space:'autorotated_jpeg_xyxy01',provider:{name:'fixture',revision:'1'},review:{status:'accepted',method:'agent_fixture_visual_check',reviewer:'AI-agent',reference:'draft1'}};
const props={src:'data:image/jpeg;base64,AA',context:{frame,issue_id:'i0',observation_id:'o0',enabled:true,fixtureMode:true},regions:[region],imageState:{status:'ready',sha256:frame.sha256,width:1440,height:810}};
const render=p=>renderToStaticMarkup(React.createElement(Component,p));
test('real component defaults off, only ready exact image draws; loading and errors have zero rectangles',()=>{
 assert.doesNotMatch(render({...props,context:{...props.context,enabled:false}}),/<rect/);
 assert.match(render(props),/<rect/);assert.match(render(props),/代理草標.*非模型定位/);
 for(const imageState of [{status:'loading'},{status:'error'},{...props.imageState,sha256:'b'.repeat(64)},{...props.imageState,width:810,height:1440}])assert.doesNotMatch(render({...props,imageState}),/<rect/);
});
test('only selected issue labels and positions; no player overlay; escaped labels and no arbitrary HTML',()=>{
 assert.match(render(props),/viewBox="0 0 1440 810"/);assert.match(render(props),/x="288"/);assert.match(render(props),/y="81"/);
 assert.doesNotMatch(render({...props,context:{...props.context,issue_id:'other'}}),/<rect/);
 assert.doesNotMatch(render(props),/<video/);
 assert.match(render({...props,regions:[{...region,label:'<script>bad</script>'}]}),/&lt;script&gt;/);
});
