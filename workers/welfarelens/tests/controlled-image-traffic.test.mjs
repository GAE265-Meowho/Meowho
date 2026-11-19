import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTraffic } from '../scripts/check-controlled-image-traffic.mjs';

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
