import { test } from "node:test";
import assert from "node:assert/strict";
import { createAnalyzeHandler } from "../src/server/azure.ts";
const env = {
  ENABLE_CLOUD_ANALYSIS: "true",
  AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
  AZURE_OPENAI_API_KEY: "test-not-a-real-key",
  AZURE_OPENAI_DEPLOYMENT: "test-deployment",
};
const image = "data:image/jpeg;base64,/9j/2Q==";
const req = (
  data = { consent: true, imageDataUrl: image },
  origin = "http://localhost:3100",
) =>
  new Request("http://localhost:3100/api/analyze", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
const candidate = {
  objects: [
    {
      kind: "window",
      label: "窗戶",
      bbox: [0.1, 0.1, 0.5, 0.5],
      notes: "不確定是否可開啟",
    },
  ],
  questions: ["防護是否牢固？"],
  limitations: ["僅單張照片"],
};
const response = (data = candidate) =>
  Response.json({
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(data) } },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 30 },
  });

test('video wire contract limits each generic condition to one boolean/null fact and stays under Azure property budget',async()=>{
 let schema;await createAnalyzeHandler(env,async(_u,init)=>{const body=JSON.parse(init.body);schema=body.response_format.json_schema.schema;assert.match(body.messages[0].content,/one concrete verb-led action per line/);assert.match(body.messages[0].content,/complete question a person can check on site/);return response();},120000,true)(req());
 const resolve=x=>x.$ref?x.$ref.split('/').slice(1).reduce((a,k)=>a[k],schema):x;
 const cases=resolve(schema.properties.assessments.items).anyOf.map(resolve),h05=cases.find(x=>x.properties.rule_id.enum?.includes('H05')),facts=resolve(h05.properties.facts),fact=resolve(facts.items);
 assert.equal(facts.maxItems,1);assert.deepEqual(fact.properties.value.type,['boolean','null']);
 let count=0;const visit=x=>{if(!x||typeof x!=='object')return;if(x.properties)count+=Object.keys(x.properties).length;Object.values(x).forEach(v=>{if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);});};visit(schema);assert.ok(count<=100,`Azure properties ${count}`);
});

test('quality prompt restores principles and relationships without six-case cap; crop mode uses high detail and botanical features',async()=>{
 const sent=[];const handle=createAnalyzeHandler(env,async(_u,init)=>{const body=JSON.parse(init.body);sent.push(body);return response(body.messages[0].content.includes('high-resolution crop')?{objects:[{kind:'plant',label:'盆栽',bbox:null,notes:''}],plants:[{object_index:0,candidates:[],features:'',identification_quality:'limited'}],image_quality:'limited',questions:[],limitations:[],assessments:[]}:candidate)});
 assert.equal((await handle(req())).status,200);
 assert.match(sent[0].messages[0].content,/climbing|攀爬/);assert.match(sent[0].messages[0].content,/principle/);
 assert.ok(!sent[0].messages[0].content.includes('at most six'));assert.ok(!sent[0].messages[0].content.includes('Omit generic prevention/enrichment'));
 assert.equal((await handle(req({consent:true,imageDataUrl:image,refinement:'plant'}))).status,200);
 assert.match(sent[1].messages[0].content,/leaf arrangement/);assert.equal(sent[1].messages[1].content[1].image_url.detail,'high');
});
test('crop mode rejects scene findings and extra plants rather than accepting unrelated detail',async()=>{const r=await createAnalyzeHandler(env,async()=>response(candidate))(req({consent:true,imageDataUrl:image,refinement:'plant'}));assert.equal(r.status,502);assert.equal((await r.json()).code,'invalid_output');});
test('provider contract restricts fact keys by rule rather than free-text mixed-rule keys',async()=>{let schema;await createAnalyzeHandler(env,async(_u,init)=>{schema=JSON.parse(init.body).response_format.json_schema.schema;return response();})(req());const resolve=x=>x.$ref?x.$ref.split('/').slice(1).reduce((a,k)=>a[k],schema):x;const item=resolve(schema.properties.assessments.items);assert.ok(item.anyOf);const h01=item.anyOf.map(resolve).find(x=>x.properties.rule_id.enum?.includes('H01'));const facts=resolve(resolve(h01.properties.facts).items);assert.deepEqual(facts.properties.key.enum,['opening_visible','unguarded_opening','access_route']);});
test('shared rule shapes stay within the documented Azure 100-property schema budget',async()=>{let schema;await createAnalyzeHandler(env,async(_u,init)=>{schema=JSON.parse(init.body).response_format.json_schema.schema;return response();})(req());let count=0;const visit=x=>{if(!x||typeof x!=='object')return;if(x.properties)count+=Object.keys(x.properties).length;for(const v of Object.values(x))if(v&&typeof v==='object')if(Array.isArray(v))v.forEach(visit);else visit(v)};visit(schema);assert.ok(count<=100,`property count ${count}`);});

test("analysis adopts fourteen single-cat principles using only the fourteen single-cat rules", async () => {
  let prompt;
  const result = await createAnalyzeHandler(env, async (_url, init) => {
    prompt = JSON.parse(init.body).messages[0].content;
    return response();
  })(req());
  assert.equal(result.status, 200);
  for (let i = 1; i <= 14; i++) assert.ok(prompt.includes(`H${String(i).padStart(2, "0")}`));
  assert.ok(prompt.includes("single-cat"));
  assert.ok(prompt.includes("not fourteen detected problems"));
  assert.ok(!prompt.includes('"rule_id":"R06"'));
  assert.ok(!prompt.includes('"rule_id":"R08"'));
  const data = await result.json();
  assert.equal(data.guidance.version, "single-cat-14/2026-11-01.2");
  assert.equal(data.guidance.scope, "single-cat");
  assert.equal(data.guidance.item_count, 14);
});

test("vision requests use completion token limits without fixed temperature", async () => {
  let sent;
  const result = await createAnalyzeHandler(env, async (_url, init) => {
    sent = JSON.parse(init.body);
    return response();
  })(req());
  assert.equal(result.status, 200);
  assert.equal(sent.max_completion_tokens, 8000);
  assert.equal(Object.hasOwn(sent, "max_tokens"), false);
  assert.equal(Object.hasOwn(sent, "temperature"), false);
});

test("scene assessment evidence returned with no invented confirmations", async () => {
  const data = {
    ...candidate,
    assessments: [
      {
        rule_id: "H01",
        object_indices: [0],
        facts: [
          {
            key: "opening_visible",
            value: true,
            status: "OBSERVATION",
            evidence: "可見窗扇打開",
            confidence: "medium",
          },
        ],
      },
    ],
  };
  const r = await createAnalyzeHandler(env, async () => response(data))(req());
  assert.equal(r.status, 200);
  assert.equal((await r.json()).candidate.assessments[0].rule_id, "H01");
});
test("model cannot fabricate confirmation or reference nonexistent objects", async () => {
  for (const [status, index] of [
    ["CONFIRMATION", 0],
    ["HYPOTHESIS", 0],
    ["OBSERVATION", 3],
  ]) {
    const data = {
      ...candidate,
      assessments: [
        {
          rule_id: "H01",
          object_indices: [index],
          facts: [
            {
              key: "opening_visible",
              value: true,
              status,
              evidence: "fixture",
              confidence: "high",
            },
          ],
        },
      ],
    };
    assert.equal(
      (await createAnalyzeHandler(env, async () => response(data))(req()))
        .status,
      502,
    );
  }
});
test("cloud disabled does not call provider", async () => {
  let calls = 0;
  const r = await createAnalyzeHandler({}, async () => {
    calls++;
    return response();
  })(req());
  assert.equal(r.status, 503);
  assert.equal(calls, 0);
});
test("missing Azure config is explicit unavailable", async () =>
  assert.equal(
    (await createAnalyzeHandler({ ENABLE_CLOUD_ANALYSIS: "true" })(req()))
      .status,
    503,
  ));
test("cross-site calls rejected before photo processing", async () =>
  assert.equal(
    (await createAnalyzeHandler(env)(req(undefined, "https://evil.example")))
      .status,
    403,
  ));
test("consent required before call", async () =>
  assert.equal(
    (
      await createAnalyzeHandler(env)(
        req({ consent: false, imageDataUrl: image }),
      )
    ).status,
    400,
  ));
test("bad image type rejected", async () =>
  assert.equal(
    (
      await createAnalyzeHandler(env)(
        req({ consent: true, imageDataUrl: "data:text/html;base64,abcd" }),
      )
    ).status,
    400,
  ));
test("JPEG signature required", async () =>
  assert.equal(
    (
      await createAnalyzeHandler(env)(
        req({ consent: true, imageDataUrl: "data:image/jpeg;base64,YWJjZA==" }),
      )
    ).status,
    400,
  ));
test("oversized body rejected without trusting length header", async () => {
  const r = await createAnalyzeHandler(env)(
    req({ consent: true, imageDataUrl: "x".repeat(2_000_001) }),
  );
  assert.equal(r.status, 413);
});
test("structured Azure result stays unverified and includes usage", async () => {
  let sent;
  const r = await createAnalyzeHandler(env, async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    return response();
  })(req());
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.verified, false);
  assert.equal(b.provider, "azure");
  assert.equal(b.candidate.objects[0].kind, "window");
  assert.equal(b.usage.prompt_tokens, 100);
  assert.equal(sent.body.response_format.type, "json_schema");
  assert.equal(sent.body.model, "test-deployment");
  assert.equal(
    sent.url,
    "https://example.openai.azure.com/openai/v1/chat/completions",
  );
  assert.equal(r.headers.get("cache-control"), "no-store");
});
for (const [upstream, status, code] of [
  [401, 502, "credentials"],
  [403, 502, "credentials"],
  [429, 429, "quota"],
  [503, 502, "provider_unavailable"],
])
  test(`Azure ${upstream} maps to ${code}`, async () => {
    const r = await createAnalyzeHandler(
      env,
      async () => new Response("secret provider detail", { status: upstream }),
    )(req());
    assert.equal(r.status, status);
    assert.equal((await r.json()).code, code);
  });
test("malformed provider JSON rejected", async () => {
  const r = await createAnalyzeHandler(env, async () =>
    Response.json({ choices: [{ message: { content: "broken" } }] }),
  )(req());
  assert.equal(r.status, 502);
  assert.equal((await r.json()).code, "invalid_output");
});

test("truncated replies explain the output limit without attempting to accept partial JSON", async () => {
  const r = await createAnalyzeHandler(env, async () => Response.json({
    choices: [{finish_reason:'length',message:{content:'{"objects":['}}],
  }))(req());
  const b = await r.json();
  assert.equal(r.status,502);
  assert.equal(b.code,'incomplete_output');
  assert.match(b.error,/回覆長度/);
});

test("invalid fact diagnostics identify the case and field without exposing evidence text", async () => {
  const r = await createAnalyzeHandler(env, async () => response({...candidate, assessments:[{
    rule_id:'H11',object_indices:[0],facts:[{key:'concern_present',value:true,status:'UNKNOWN',evidence:'PRIVATE ROOM TEXT',confidence:'medium'}],proposal:null,
  }]}))(req());
  const b=await r.json();
  assert.equal(r.status,502);
  assert.equal(b.code,'invalid_output');
  assert.match(b.error,/assessments\.0\.facts\.0/);
  assert.ok(!JSON.stringify(b).includes('PRIVATE ROOM TEXT'));
});

test("nonexistent object references report their precise path", async () => {
  const r=await createAnalyzeHandler(env,async()=>response({...candidate,assessments:[{rule_id:'H11',object_indices:[8],facts:[],proposal:null}]}))(req());
  const b=await r.json();
  assert.equal(r.status,502);
  assert.match(b.error,/assessments\.0\.object_indices\.0/);
});
test("schema-invalid response is not silently repaired", async () => {
  const r = await createAnalyzeHandler(env, async () =>
    response({ ...candidate, safetyScore: 100 }),
  )(req());
  assert.equal(r.status, 502);
});
test("refusal is explicit invalid output", async () => {
  const r = await createAnalyzeHandler(env, async () =>
    Response.json({ choices: [{ message: { refusal: "no" } }] }),
  )(req());
  assert.equal(r.status, 502);
});
test("timeout remains distinguishable", async () => {
  const r = await createAnalyzeHandler(env, async () => {
    throw new DOMException("Timeout", "TimeoutError");
  })(req());
  assert.equal(r.status, 504);
  assert.equal((await r.json()).code, "timeout");
});
test("network failure returns usable manual fallback message", async () => {
  const r = await createAnalyzeHandler(env, async () => {
    throw new Error("key must not leak");
  })(req());
  assert.equal(r.status, 502);
  assert.ok(!(await r.text()).includes("key must not leak"));
});
test("endpoint must be a trusted Azure HTTPS resource", async () => {
  let called = false;
  const r = await createAnalyzeHandler(
    { ...env, AZURE_OPENAI_ENDPOINT: "http://localhost:9000" },
    async () => {
      called = true;
      return response();
    },
  )(req());
  assert.equal(r.status, 503);
  assert.equal(called, false);
});

test("official Azure v1 base URL is accepted without duplicating its path", async () => {
  let sentUrl;
  const result = await createAnalyzeHandler(
    {
      ...env,
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com/openai/v1/",
    },
    async (url) => {
      sentUrl = url;
      return response();
    },
  )(req());
  assert.equal(result.status, 200);
  assert.equal(
    sentUrl,
    "https://example.openai.azure.com/openai/v1/chat/completions",
  );
});

test("Next internal localhost URL accepts the actual same-origin Host header", async () => {
  const request = new Request("http://localhost:3100/api/analyze", {
    method: "POST",
    headers: {
      host: "127.0.0.1:3100",
      origin: "http://127.0.0.1:3100",
      "content-type": "application/json",
    },
    body: JSON.stringify({ consent: true, imageDataUrl: image }),
  });
  const result = await createAnalyzeHandler(env, async () => response())(
    request,
  );
  assert.equal(result.status, 200);
});
test("Azure strict schema uses homogeneous numeric arrays rather than unsupported tuple items", async () => {
  let schema;
  await createAnalyzeHandler(env, async (_url, init) => {
    schema = JSON.parse(init.body).response_format.json_schema.schema;
    return response();
  })(req());
  const resolve = x => x.$ref ? x.$ref.split('/').slice(1).reduce((a,k)=>a[k],schema) : x;
  const bbox = resolve(resolve(schema.properties.objects).items).properties.bbox.anyOf.map(resolve).find(
    (x) => x.type === "array",
  );
  assert.equal(Array.isArray(bbox.items), false);
  assert.equal(resolve(bbox.items).type, "number");
});
test("real deadline aborts an outstanding provider request", async () => {
  const r = await createAnalyzeHandler(
    env,
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(init.signal.reason),
          { once: true },
        );
      }),
    15,
  )(req());
  assert.equal(r.status, 504);
});

test('single call includes plant contract and local lookup timing without extra service',async()=>{
 let calls=0,sent;const data={...candidate,plants:[],image_quality:'adequate'};
 const r=await createAnalyzeHandler(env,async(_url,init)=>{calls++;sent=JSON.parse(init.body);return response(data);})(req());
 const out=await r.json();assert.equal(calls,1);assert.ok(sent.response_format.json_schema.schema.required.includes('plants'));assert.ok(sent.response_format.json_schema.schema.required.includes('image_quality'));assert.equal(out.scan.quality,'adequate');assert.ok(out.timings.toxicityLookupMs>=0);assert.ok(out.timings.vlmMs>=0);assert.ok(out.timings.serverTotalMs>=out.timings.vlmMs);
});

test('provider body stall times out after headers rather than waiting forever',async()=>{
 const pending=createAnalyzeHandler(env,async()=>new Response(new ReadableStream({start(){},cancel(){}})),15)(req());
 const result=await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve(null),80))]);assert.ok(result,'response body deadline was not enforced');assert.equal(result.status,504);
});
