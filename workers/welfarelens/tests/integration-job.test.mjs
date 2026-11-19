import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp, mkdir, readFile, writeFile, copyFile, rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join, resolve} from 'node:path';
import {executeFixtureJob} from '../src/server/video/standalone.ts';
import {processIntegrationJob} from '../src/server/video/integration-job.ts';

const run = promisify(execFile);
const browser = process.env.WELFARELENS_TEST_PDF_BROWSER;
const fixture = JSON.parse(await readFile('evals/fixtures/worker-scene.json', 'utf8'));
const claimSql = `UPDATE jobs SET status='running', attempt=attempt+1, lease_until=?
  WHERE id=(SELECT id FROM jobs WHERE status='queued' OR
    (status='running' AND lease_until<=?) ORDER BY id LIMIT 1)
  RETURNING id, source, attempt`;

async function harness(t) {
  await mkdir('private-eval', {recursive:true});
  const root = await mkdtemp(join(resolve('private-eval'), 'job241-'));
  const dbPath = join(root, 'jobs.sqlite');
  const db = new DatabaseSync(dbPath);
  t.after(async () => { db.close(); await rm(root, {recursive:true, force:true}); });
  db.exec(`CREATE TABLE jobs (id TEXT PRIMARY KEY, source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', attempt INTEGER NOT NULL DEFAULT 0,
    lease_until INTEGER, result TEXT, error TEXT)`);
  const sourceDir = join(root, 'source');
  const storage = join(root, 'artifacts');
  await mkdir(sourceDir);
  await mkdir(storage);
  const source = 'home-1.mp4';
  await copyFile('welfarelens-video-spike/samples/synthetic-room.mp4', join(sourceDir, source));
  db.prepare('INSERT INTO jobs (id,source) VALUES (?,?)').run('job-1', source);
  let now = 100;
  const finish = (job, status, artifacts, error) => !!db.prepare(`UPDATE jobs SET status=?, result=?, error=?
    WHERE id=? AND attempt=? AND status='running' AND lease_until>?`)
    .run(status, artifacts ? JSON.stringify(artifacts) : null, error, job.id, job.attempt, now).changes;
  const ports = {
    claim: async () => db.prepare(claimSql).get(now+50, now),
    readSource: async (job, destination) => copyFile(join(sourceDir, job.source), destination),
    analyze: (input, root) => executeFixtureJob({input, root, fixture, pdfBrowser:browser}),
    save: async (job, name, file) => {
      const key = `${job.id}/${job.attempt}/${name}`;
      await mkdir(join(storage, job.id, String(job.attempt)), {recursive:true});
      await writeFile(join(storage, key), await readFile(file), {flag:'wx'});
      return key;
    },
    complete: async (job, artifacts) => finish(job, 'ready', artifacts, null),
    fail: async (job, error) => finish(job, 'failed', null, error),
  };
  return {root, dbPath, storage, ports, sourceDir, source, advance: () => { now += 50; },
    row: () => db.prepare('SELECT * FROM jobs').get(),
    retry: () => db.prepare("UPDATE jobs SET status='queued' WHERE status='failed'").run()};
}

test('separate SQLite processes compete for one atomic claim; a replacement can claim after expiry', async t => {
  const h = await harness(t);
  const claim = () => run(process.execPath, ['--input-type=module', '-e',
    'import {DatabaseSync} from "node:sqlite"; const db = new DatabaseSync(process.argv[1]); db.exec("PRAGMA busy_timeout=5000"); console.log(JSON.stringify(db.prepare(process.argv[2]).get(150,100) ?? null));',
    h.dbPath, claimSql]).then(({stdout}) => JSON.parse(stdout));
  const winners = (await Promise.all([claim(), claim()])).filter(Boolean);
  assert.equal(winners.length, 1);
  assert.equal(await h.ports.claim(), undefined);
  h.advance();
  const replacement = await h.ports.claim();
  assert.equal(replacement.attempt, 2);
  assert.equal(await h.ports.complete(winners[0], {}), false);
  assert.equal(await h.ports.fail(winners[0], 'analysis'), false);
  assert.equal(await h.ports.complete(replacement, {report:'current'}), true);
  assert.equal(await h.ports.complete(replacement, {report:'late'}), false);
  assert.deepEqual(JSON.parse(h.row().result), {report:'current'});
});

test('source failure is recorded, and an explicit retry can save actual Worker PDF and JSON', {skip:!browser}, async t => {
  const h = await harness(t);
  const original = await readFile(join(h.sourceDir, h.source));
  await rm(join(h.sourceDir, h.source));
  assert.equal(await processIntegrationJob(h.root, h.ports), 'failed');
  assert.equal(h.row().error, 'source');
  await writeFile(join(h.sourceDir, h.source), original);
  h.retry();
  assert.equal(await processIntegrationJob(h.root, h.ports), 'ready');
  const row = h.row();
  assert.equal(row.attempt, 2);
  assert.equal(await processIntegrationJob(h.root, h.ports), 'idle');
  const refs = JSON.parse(row.result);
  const report = JSON.parse(await readFile(join(h.storage, refs['report.json']), 'utf8'));
  assert.equal((await readFile(join(h.storage, refs['before-after.pdf']))).subarray(0,5).toString(), '%PDF-');
  assert.ok(report.report_id);
  assert.deepEqual(await readFile(join(h.sourceDir, h.source)), original);
});

test('missing required PDF and failed artifact save never produce ready', async t => {
  const h = await harness(t);
  const analyzeWithoutPdf = (input, root) => executeFixtureJob({input, root, fixture});
  assert.equal(await processIntegrationJob(h.root, {...h.ports, analyze:analyzeWithoutPdf}), 'failed');
  assert.equal(h.row().error, 'artifacts');
  assert.equal(h.row().result, null);
  if (browser) {
    h.retry();
    assert.equal(await processIntegrationJob(h.root, {...h.ports, save:async () => { throw Error('storage failure'); }}), 'failed');
    assert.equal(h.row().error, 'storage');
    assert.equal(h.row().result, null);
  }
});

test('expired worker completing after the replacement cannot publish stale references', {skip:!browser}, async t => {
  const h = await harness(t);
  let replace = true;
  const result = await processIntegrationJob(h.root, {...h.ports, save:async (...args) => {
    if (replace) {
      replace = false;
      h.advance();
      assert.equal(await processIntegrationJob(h.root, h.ports), 'ready');
    }
    return h.ports.save(...args);
  }});
  assert.equal(result, 'lease_lost');
  assert.ok(Object.values(JSON.parse(h.row().result)).every(key => key.startsWith('job-1/2/')));
});

test('analyzer failure is recorded without saving artifacts', async t => {
  const h = await harness(t);
  let saves = 0;
  const outcome = await processIntegrationJob(h.root, {...h.ports,
    analyze:async () => { throw Error('mock inference failed'); },
    save:async () => { saves++; return 'unexpected'; },
  });
  assert.equal(outcome, 'failed');
  assert.equal(h.row().error, 'analysis');
  assert.equal(h.row().result, null);
  assert.equal(saves, 0);
});

test('partial analysis never enters artifact storage or calls complete', async t => {
  const h = await harness(t);
  let saves = 0, completions = 0;
  assert.equal(await processIntegrationJob(h.root, {...h.ports,
    analyze: async () => ({outcome:'partial'}),
    save: async () => { saves++; return 'unexpected'; },
    complete: async () => { completions++; return true; },
  }), 'failed');
  assert.equal(h.row().error, 'analysis');
  assert.equal(saves, 0);
  assert.equal(completions, 0);
});

test('required JSON and invalid PDF are rejected before uploading', {skip:!browser}, async t => {
  const h = await harness(t);
  for (const [name, contents] of [['report.json','{}'],['before-after.pdf','%PDF-1.7']]) {
    const analyze = async (input, root) => {
      const result = await h.ports.analyze(input, root);
      await writeFile(join(root,result.job_id,name),contents);
      return result;
    };
    assert.equal(await processIntegrationJob(h.root,{...h.ports,analyze}), 'failed');
    assert.equal(h.row().error,'artifacts');assert.equal(h.row().result,null);
    h.retry();
  }
});

test('a requested AI illustration with missing evidence cannot be published', {skip:!browser}, async t => {
  const h = await harness(t);
  const claim = async () => ({...await h.ports.claim(),requireImages:true});
  const analyze = async (input, root) => {
    const result=await h.ports.analyze(input,root);
    const path=join(root,result.job_id,'welfarelens-illustrations.v1.json');
    const index=JSON.parse(await readFile(path,'utf8'));
    index.cases=[{comparison_id:'unapproved',detail_sha256:null,generation_status:'review_required',review_status:'not_reviewed',disposition:'quality_review_required',
      before_image_ref:'f000.jpg',after_image_ref:'after.png',before_detail_ref:'before-detail.jpg',after_detail_ref:'after-detail.jpg'}];
    await writeFile(path,JSON.stringify(index));
    return result;
  };
  assert.equal(await processIntegrationJob(h.root,{...h.ports,claim,analyze}), 'failed');
  assert.equal(h.row().error,'artifacts');assert.equal(h.row().result,null);
});
