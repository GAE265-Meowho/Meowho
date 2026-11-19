import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const minute = 60_000;
const bucket = time => Math.floor(time / minute) * minute;

// Reconcile the entire closed window, including the quiet minutes on both
// sides. The caller fixes the label convention before inspecting live results.
export function checkTraffic(points, starts, start, end, labelOffset, now = Date.now()) {
  if (![start, end].every(t => Number.isSafeInteger(t) && t % minute === 0) ||
      end - start < 3 * minute || end - start > 120 * minute ||
      end > now - 2 * minute || ![0, 1].includes(labelOffset)) return 'incomplete';
  const expected = new Map();
  for (const dispatch of starts) {
    if (!Number.isSafeInteger(dispatch) || dispatch < start + minute || dispatch >= end - 2 * minute)
      return 'incomplete';
    const time = bucket(dispatch) + labelOffset * minute;
    expected.set(time, (expected.get(time) ?? 0) + 1);
  }
  const observed = new Map();
  for (const { timeStamp, total } of points) {
    const time = Date.parse(timeStamp);
    if (!Number.isSafeInteger(time) || time % minute !== 0 || observed.has(time)) return 'incomplete';
    if (time < start || time >= end) continue;
    observed.set(time, total);
  }
  let missing = false;
  let shifted = false;
  let observedTotal = 0;
  for (let time = start; time < end; time += minute) {
    const actual = observed.get(time);
    const planned = expected.get(time) ?? 0;
    if (!Number.isSafeInteger(actual) || actual < 0) {
      missing = true;
      continue;
    }
    observedTotal += actual;
    // A count outside every possible local dispatch bucket is unexplained
    // even if Azure has yet to populate the other buckets.
    if (actual > starts.filter(at => [bucket(at), bucket(at) + minute].includes(time)).length)
      return 'unexplained';
    if (actual !== planned) shifted = true;
  }
  if (observedTotal > starts.length) return 'unexplained';
  if (missing || observedTotal < starts.length) return 'incomplete';
  return shifted ? 'unexplained' : 'matched';
}

function dispatchTimes(path) {
  if (!path) return [];
  const events = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const dispatches = events.filter(e => e.event === 'dispatch');
  const responses = events.filter(e => e.event === 'response').sort((a, b) => a.dispatch - b.dispatch);
  const ended = events.filter(e => e.event === 'run_end');
  if (events[0]?.event !== 'batch' || ended.length < 1 || ended.length > 6 ||
      ended.some((e, i) => !e.ok || e.run !== i + 1) ||
      dispatches.length !== ended.length * 6 || dispatches.some(e => e.kind !== 'image') ||
      responses.length !== dispatches.length || responses.some((e, i) => e.dispatch !== i + 1 ||
        e.failure !== null || !Number.isInteger(e.status) || e.status < 200 || e.status >= 300) ||
      responses.some((e, i) => i > 0 && e.transportAtMs - responses[i - 1].transportAtMs < 12_000))
    throw Error('Unverified benchmark journal');
  return responses.map(e => e.transportAtMs);
}

function main() {
  const { values } = parseArgs({ options: {
    metrics: { type: 'string' }, journal: { type: 'string' },
    start: { type: 'string' }, end: { type: 'string' }, 'label-offset': { type: 'string' },
  } });
  if (!values.metrics || !/^[01]$/.test(values['label-offset'] ?? '')) throw Error('Invalid arguments');
  const points = JSON.parse(readFileSync(values.metrics, 'utf8'));
  if (!Array.isArray(points)) throw Error('Expected exactly one deployment-filtered series');
  const result = checkTraffic(points, dispatchTimes(values.journal),
    Date.parse(values.start), Date.parse(values.end), Number(values['label-offset']));
  console.log(JSON.stringify({ event: 'controlled_image_traffic', result }));
  process.exitCode = result === 'matched' ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch {
    console.error('Traffic verification failed. Review the local snapshot and journal.');
    process.exitCode = 1;
  }
}
