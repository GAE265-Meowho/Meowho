import { test } from "node:test";
import assert from "node:assert/strict";
import { SINGLE_CAT_GUIDANCE, GUIDANCE_SOURCES, GUIDANCE_VERSION } from "../src/data/single-cat-guidance.ts";
import { RULES } from "../src/data/knowledge.ts";

test("single-cat catalogue preserves the user's fourteen ordered items and 6/6/2 priorities", () => {
  assert.equal(typeof GUIDANCE_VERSION, "string");
  assert.deepEqual(SINGLE_CAT_GUIDANCE.map(x => x.id), Array.from({length:14}, (_, i) => `H${String(i+1).padStart(2,"0")}`));
  assert.deepEqual(SINGLE_CAT_GUIDANCE.map(x => x.priority), [...Array(6).fill("HIGH"), ...Array(6).fill("BASIC"), ...Array(2).fill("ENRICHMENT")]);
});

test("every item has traceable source sections, separate applications and photo limitations", () => {
  for (const item of SINGLE_CAT_GUIDANCE) {
    assert.ok(item.principle.length > 0 && item.application.length > 0 && item.photo_limit.length > 0, item.id);
    assert.ok(item.sources.length > 0, item.id);
    for (const ref of item.sources) {
      const source = GUIDANCE_SOURCES[ref.id];
      assert.ok(source && ref.section.length > 0, item.id);
      assert.match(source.url, /^https:\/\//);
      assert.equal(source.checked_on, "2026-11-01");
    }
    assert.ok(RULES.some(rule=>rule.rule_id===item.id));
  }
});

test("hiding is a single-cat resource need, not a multi-cat exit rule or an invented location", () => {
  const hiding = SINGLE_CAT_GUIDANCE.find(x => x.id === "H11");
  assert.equal(RULES.find(r=>r.rule_id==="H11").required_conditions[0].key,"concern_present");
  assert.match(hiding.application, /自由進出/);
  assert.match(hiding.photo_limit, /尺寸|動線/);
  assert.equal(Object.hasOwn(hiding, "bbox"), false);
});

test("plants require identity evidence and off-camera or routine information stays unknown", () => {
  assert.match(SINGLE_CAT_GUIDANCE[1].photo_limit, /學名/);
  assert.match(SINGLE_CAT_GUIDANCE[6].photo_limit, /清理頻率/);
  assert.match(SINGLE_CAT_GUIDANCE[7].photo_limit, /換水/);
  assert.match(SINGLE_CAT_GUIDANCE[13].photo_limit, /每天/);
  for (const item of SINGLE_CAT_GUIDANCE) {
    assert.equal(Object.hasOwn(item, "risk_status"), false);
    assert.equal(Object.hasOwn(item, "certified_safe"), false);
    assert.ok(!JSON.stringify(item).includes("multi_cat"));
  }
});
