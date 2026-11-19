import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('CLI exits nonzero when requested PDF fails, preserving JSON and diagnostic bundle', async () => {
  await mkdir('private-eval', {recursive:true});
  const root = await mkdtemp(join(process.cwd(), 'private-eval', 'cli-failure-'));
  try {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/standalone-worker.ts',
      '--input', 'welfarelens-video-spike/samples/synthetic-room.mp4', '--root', root,
      '--fixture', 'evals/fixtures/worker-scene.json'], {
      encoding: 'utf8', timeout: 30000, env: {...process.env, WELFARELENS_PDF_BROWSER: join(root, 'missing-browser')}
    });
    assert.ifError(result.error);
    const bundle = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(bundle.stages.pdf, 'failed');
    assert.equal(bundle.stages.json, 'completed');
    assert.deepEqual(JSON.parse(await readFile(join(root, bundle.job_id, 'bundle.json'), 'utf8')).stages, bundle.stages);
    assert.equal(result.status, 1);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('CLI exits nonzero if a required JSON write is refused', async () => {
  await mkdir('private-eval', {recursive:true});
  const root = await mkdtemp(join(process.cwd(), 'private-eval', 'cli-json-failure-'));
  const inject = `import fs from 'node:fs/promises';
    import {syncBuiltinESMExports} from 'node:module';
    import {basename} from 'node:path';
    const original = fs.writeFile;
    fs.writeFile = async (path, ...args) => {
      if (basename(path) === 'meowho-report.json') {
        console.error('injected-json-write-failure');
        throw Error('synthetic write failure');
      }
      return original(path, ...args);
    };
    syncBuiltinESMExports();`;
  try {
    const result = spawnSync(process.execPath, ['--experimental-strip-types',
      '--import', 'data:text/javascript,' + encodeURIComponent(inject), 'scripts/standalone-worker.ts',
      '--input', 'welfarelens-video-spike/samples/synthetic-room.mp4', '--root', root,
      '--fixture', 'evals/fixtures/worker-scene.json'], {
      encoding:'utf8', timeout:30000, env:{...process.env, WELFARELENS_PDF_BROWSER:''}
    });
    assert.ifError(result.error);
    assert.match(result.stderr, /injected-json-write-failure/);
    assert.match(result.stderr, /standalone_error/);
    assert.doesNotMatch(result.stdout, /standalone_result/);
    assert.equal(result.status, 1);
  } finally {
    await rm(root, {recursive:true, force:true});
  }
});
