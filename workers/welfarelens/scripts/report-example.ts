import {writeFile} from 'node:fs/promises';import {z} from 'zod';import {WelfareLensReportV1Schema,buildWelfareLensReport,toMeowhoEnvReport} from '../src/domain/welfare-report.ts';import {aggregateVideoIssues,RawObservationSchema,IssueReportSchema} from '../src/domain/video-issues.ts';import {observation,id} from '../tests/fixtures/video-p0.mjs';
const source=IssueReportSchema.parse({version:1,video_id:id,source:'snapshot',...aggregateVideoIssues([RawObservationSchema.parse(observation('synthetic-wire',{title:'合成測試：外露線材',observation:'合成範例，不是實際房間或 Azure 判讀。'}))],[],()=> 'example-wire')});const report=buildWelfareLensReport(source,'incomplete',1793664000000);
await writeFile('docs/examples/welfarelens-report-v1.json',JSON.stringify(report,null,2));await writeFile('docs/examples/meowho-env-report.json',JSON.stringify(toMeowhoEnvReport(report),null,2));await writeFile('docs/examples/welfarelens-report-v1.schema.json',JSON.stringify(z.toJSONSchema(WelfareLensReportV1Schema),null,2));

import {buildVisualReport,VisualReportSchema} from '../src/domain/visual-report.ts';
const visual=buildVisualReport(source,report,{video_id:source.video_id,created_at:report.generated_at,expires_at:report.generated_at+1800000,metadata:undefined,frames:[],model:'synthetic-example',metrics:undefined});
await writeFile('docs/examples/welfarelens-visual-report-v1.json',JSON.stringify(visual,null,2));
await writeFile('docs/examples/welfarelens-visual-report-v1.schema.json',JSON.stringify(z.toJSONSchema(VisualReportSchema),null,2));
