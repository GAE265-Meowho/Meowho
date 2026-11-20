import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTraffic, reconcileTraffic, snapshot, queryMonitor } from '../scripts/check-controlled-image-traffic.mjs';

const minute = 60_000;
const start = Date.UTC(2026, 10, 19, 0, 0);
const end = start + 6 * minute;
const now = end + 2 * minute;
const dispatches = [start + minute + 59_000, start + 2 * minute + 11_000];
const series = counts => counts.map((total, i) => ({ timeStamp: new Date(start + i * minute).toISOString(), total }));
const match = (counts, offset = 1) => checkTraffic(series(counts), dispatches, start, end, offset, now);

test('closed buckets match the fixed label convention without switching conventions on mismatch', () => {
  assert.equal(match([0, 0, 1, 1, 0, 0]), 'matched');
  assert.equal(match([0, 1, 1, 0, 0, 0], 0), 'matched');
  assert.equal(match([0, 1, 1, 0, 0, 0]), 'unexplained');
});

test('extra, missing, recent and out-of-window traffic cannot pass', () => {
  assert.equal(match([0, 0, 2, 1, 0, 0]), 'unexplained');
  assert.equal(match([0, 0, 1, 1, 1, null]), 'unexplained');
  assert.equal(match([0, 0, 1, null, 0, 0]), 'incomplete');
  assert.equal(match([0, 0, 1, 0, 0, 0]), 'incomplete');
  assert.equal(checkTraffic(series([0, 0, 1, 1, 0, 0]), dispatches, start, end, 1, end), 'incomplete');
  assert.equal(checkTraffic(series([0, 0, 1, 1, 0, 0]), [end], start, end, 1, now), 'incomplete');
});

test('preflight requires an entirely measured zero-traffic window', () => {
  assert.equal(checkTraffic(series([0, 0, 0, 0, 0, 0]), [], start, end, 1, now), 'matched');
  assert.equal(checkTraffic(series([0, 0, 0, 0, 0, null]), [], start, end, 1, now), 'incomplete');
  assert.equal(checkTraffic(series([0, 0, 0, 0, 0, 1]), [], start, end, 1, now), 'unexplained');
});

const deployment = 'test-deployment';
const nearBoundary = [start + 2 * minute - 28, start + 2 * minute + 12_000];
const docs = (counts, status) => ({
  interval: 'PT1M',
  value: [{ name: { value: 'AzureOpenAIRequests' }, timeseries: [{ metadatavalues: [
    { name: { value: 'modeldeploymentname' }, value: deployment },
    ...(status ? [{ name: { value: 'statuscode' }, value: status }] : []),
  ], data: series(counts) }] }],
});
const read = (counts, capturedAt, http = counts) =>
  ({ ...snapshot(docs(counts), docs(http, '200'), deployment, start, end), capturedAt });
const verify = (a, b, starts = nearBoundary, confirmedUntil = now + 3 * minute) =>
  reconcileTraffic(read(a, now), read(b, now + minute), starts, start, end, confirmedUntil);

test('only a bounded adjacent forward shift can be classified as uncertain', () => {
  assert.equal(verify([0, 0, 1, 1, 0, 0], [0, 0, 1, 1, 0, 0]), 'matched');
  assert.equal(verify([0, 0, 0, 2, 0, 0], [0, 0, 0, 2, 0, 0]), 'boundary_uncertain');
  assert.equal(verify([0, 0, 0, 2, 0, 0], [0, 0, 0, 2, 0, 0], dispatches), 'unexplained');
  assert.equal(verify([0, 0, 0, 1, 1, 0], [0, 0, 0, 1, 1, 0]), 'unexplained');
  assert.equal(verify([0, 0, 1, 2, 0, 0], [0, 0, 0, 2, 0, 0]), 'unexplained');
});

test('local-zone strings are rejected and UTC midnight is continuous', () => {
  const total = docs([0, 0, 0, 2, 0, 0]);
  total.value[0].timeseries[0].data[0].timeStamp = '2026-11-19T00:00:00';
  assert.throws(() => snapshot(total, docs([0, 0, 0, 2, 0, 0], '200'), deployment, start, end), /data point/);
  const midnight = start + 24 * 60 * minute;
  const readout = { counts: [0, 0, 0, 2, 0, 0], capturedAt: midnight + 6 * minute };
  assert.equal(reconcileTraffic(readout, { ...readout, capturedAt: midnight + 7 * minute },
    [midnight - 28, midnight + 12_000], midnight - 2 * minute, midnight + 4 * minute,
    midnight + 9 * minute), 'boundary_uncertain');
});

test('missing, still-changing or unconfirmed data cannot pass', () => {
  assert.equal(verify([0, 0, null, 1, 0, 0], [0, 0, 1, 1, 0, 0]), 'incomplete');
  assert.equal(verify([0, 0, 0, 1, 0, 0], [0, 0, 0, 1, 0, 0]), 'incomplete');
  assert.equal(verify([0, 0, 1, 1, 0, 0], [0, 0, 0, 2, 0, 0]), 'incomplete');
  assert.equal(verify([0, 0, 0, 2, 0, 0], [0, 0, 0, 2, 0, 0], nearBoundary, now), 'incomplete');
  assert.equal(read([0, 0, 0, 2, 0, 0], now, [0, 0, 0, null, 0, 0]).result, 'incomplete');
  assert.equal(snapshot(docs([0, 0, 0, 2, 0, 0]), docs([0, 0, 0, 2, 0, 0], '429'), deployment, start, end).result, 'unexplained');
  assert.throws(() => snapshot(docs([0, 0, 0, 2, 0, 0]), docs([0, 0, 0, 2, 0, 0], '200'), 'other', start, end), /dimension/);
});

test('only known transport resets retry a bounded read-only Monitor query', async () => {
  let calls = 0;
  const waits = [];
  const reset = { status: 1, stderr: 'ConnectionResetError(10054, masked)' };
  const sleep = async ms => { waits.push(ms); };
  assert.deepEqual(await queryMonitor(() => ++calls === 2 ? { status: 0, stdout: '{}' } : reset, sleep), {});
  assert.deepEqual(waits, [3000]);
  calls = 0;
  await assert.rejects(queryMonitor(() => { calls++; return reset; }, sleep), /query failed/);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(queryMonitor(() => { calls++; return { status: 1, stderr: 'Forbidden' }; }, sleep), /query failed/);
  assert.equal(calls, 1);
});
