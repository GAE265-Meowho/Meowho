import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const minute = 60_000;
const bucket = time => Math.floor(time / minute) * minute;
const utc = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  ? Date.parse(value) : NaN;
const utcIso = time => new Date(time).toISOString();
const boundaryMs = 100;

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
    const time = utc(timeStamp);
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

function dispatchTimes(path, order) {
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
  if (order) {
    let cursor = 1;
    let previousEnd = 0;
    for (const [index, concurrency] of order.slice(0, ended.length).entries()) {
      const run = index + 1;
      const first = events[cursor++];
      const live = new Set();
      let issued = 0;
      if (first?.event !== 'run_start' || first.run !== run || first.concurrency !== concurrency ||
          !(utc(first.at) >= previousEnd)) throw Error('Unverified journal run start');
      while (events[cursor]?.event !== 'run_end') {
        const e = events[cursor++];
        if (e?.event === 'dispatch' && e.run === run && issued < 6 &&
            Number.isSafeInteger(e.atMs) && e.atMs >= utc(first.at) && e.reservedUsdMicros === 750_000) {
          live.add(index * 6 + ++issued);
        } else if (e?.event !== 'response' || !live.delete(e.dispatch) || e.status !== 200 ||
            !Number.isSafeInteger(e.transportAtMs) || e.transportAtMs < dispatches[e.dispatch - 1].atMs ||
            !Number.isSafeInteger(e.headerAtMs) || e.headerAtMs < e.transportAtMs || e.headerAtMs > utc(ended[index].at)) {
          throw Error('Unverified journal dispatch/response');
        }
      }
      previousEnd = utc(events[cursor++].at);
      if (issued !== 6 || live.size || !Number.isSafeInteger(previousEnd))
        throw Error('Unverified journal run end');
    }
    if (cursor !== events.length) throw Error('Unfinished benchmark journal');
  }
  return responses.map(e => e.transportAtMs);
}

function metricSeries(doc, deployment, byStatus) {
  const metric = doc?.value?.[0];
  if (doc?.interval !== 'PT1M' || doc.value.length !== 1 ||
      metric?.name?.value !== 'AzureOpenAIRequests' || !Array.isArray(metric.timeseries) ||
      (!byStatus && metric.timeseries.length !== 1)) throw Error('Unexpected Monitor metric identity');
  const result = new Map();
  for (const entry of metric.timeseries) {
    const dimensions = new Map(entry.metadatavalues?.map(d => [d.name.value.toLowerCase(), d.value]));
    const status = byStatus ? dimensions.get('statuscode') : 'total';
    if (dimensions.get('modeldeploymentname') !== deployment || dimensions.size !== (byStatus ? 2 : 1) ||
        (byStatus && !/^[1-5]\d\d$/.test(status ?? '')) || result.has(status) || !Array.isArray(entry.data))
      throw Error('Unexpected Monitor deployment or status dimension');
    const counts = new Map();
    for (const point of entry.data) {
      const time = utc(point.timeStamp);
      if (!Number.isSafeInteger(time) || time % minute || counts.has(time) ||
          (point.total != null && (!Number.isSafeInteger(point.total) || point.total < 0)))
        throw Error('Invalid Monitor data point');
      counts.set(time, point.total);
    }
    result.set(status, counts);
  }
  return result;
}

function snapshot(totalDoc, statusDoc, deployment, start, end) {
  const totals = metricSeries(totalDoc, deployment, false).get('total');
  const statuses = metricSeries(statusDoc, deployment, true);
  const counts = [];
  let unknown = false;
  for (const [status, series] of statuses) {
    for (const [time, value] of series) {
      if (time >= start && value > 0 && (status !== '200' || time >= end)) return { result: 'unexplained' };
    }
  }
  for (const [time, total] of totals) {
    if (time >= end && total > 0) return { result: 'unexplained' };
  }
  for (let time = start; time < end; time += minute) {
    const total = totals.get(time);
    const success = statuses.get('200')?.get(time);
    if (total != null && success > total) return { result: 'unexplained' };
    if (total == null || (total > 0 && success !== total)) unknown = true;
    counts.push(total);
  }
  return { counts, result: unknown ? 'incomplete' : null };
}

export function reconcileTraffic(first, second, starts, start, end, confirmedUntil) {
  if (second.capturedAt - first.capturedAt < minute || end > first.capturedAt - 2 * minute ||
      confirmedUntil <= second.capturedAt) return 'incomplete';
  if ([first, second].some(s => s.result === 'unexplained')) return 'unexplained';
  const expected = new Map();
  const movable = new Set();
  for (const at of starts) {
    if (!Number.isSafeInteger(at) || at < start + minute) return 'incomplete';
    const nearBoundary = minute - at % minute <= boundaryMs;
    const label = bucket(at) + minute;
    if (label + (nearBoundary ? 3 : 2) * minute > end) return 'incomplete';
    expected.set(label, (expected.get(label) ?? 0) + 1);
    if (nearBoundary) movable.add(label);
  }
  for (const s of [first, second]) {
    let total = 0;
    for (const [index, count] of s.counts.entries()) {
      const label = start + index * minute;
      if (count > (expected.get(label) ?? 0) + Number(movable.has(label - minute))) return 'unexplained';
      total += count ?? 0;
    }
    if (total > starts.length) return 'unexplained';
  }
  if ([first, second].some(s => s.result) || first.counts.length !== (end - start) / minute ||
      second.counts.length !== first.counts.length ||
      first.counts.some((value, i) => value !== second.counts[i])) return 'incomplete';
  if (second.counts.reduce((total, value) => total + value, 0) < starts.length) return 'incomplete';
  // A prefix deficit is exactly the number that must move across its right
  // boundary. Only that bucket's own near-boundary dispatch can supply it.
  let carry = 0;
  let uncertain = false;
  for (let i = 0; i < second.counts.length; i++) {
    const label = start + i * minute;
    carry += (expected.get(label) ?? 0) - second.counts[i];
    if (carry < 0 || carry > (movable.has(label) ? 1 : 0)) return 'unexplained';
    uncertain ||= carry === 1;
  }
  return carry ? 'unexplained' : uncertain ? 'boundary_uncertain' : 'matched';
}

export async function queryMonitor(read, sleep = delay) {
  for (let attempt = 1; ; attempt++) {
    const response = read();
    if (response.status === 0) return JSON.parse(response.stdout);
    const transient = /ConnectionResetError\(10054\b|ECONNRESET|Connection reset by peer/.test(response.stderr ?? '');
    console.error(JSON.stringify({ event: 'monitor_query_failed', attempt, exit: response.status,
      error: transient ? 'connection reset' : 'Monitor command failed' }));
    if (!transient || attempt === 3) throw Error('Azure Monitor query failed');
    await sleep(attempt * 3000);
  }
}

async function liveCheck(values) {
  const start = utc(values.start);
  const end = utc(values.end);
  const confirmedUntil = utc(values['confirmed-until']);
  if (![start, end].every(t => Number.isSafeInteger(t) && t % minute === 0) ||
      end - start < 4 * minute || end - start > 120 * minute || end > Date.now() - 2 * minute ||
      !(confirmedUntil > Date.now() + minute) || !values['azure-python'] || !values['azure-resource'] ||
      !values['snapshot-prefix'] || !values.journal || !/^[\w.-]+$/.test(values.deployment ?? ''))
    throw Error('Invalid live Monitor arguments');
  const starts = dispatchTimes(values.journal, [1, 2, 3, 3, 2, 1]);
  const filter = `ModelDeploymentName eq '${values.deployment}'`;
  async function capture() {
    const capturedAt = Date.now();
    const read = suffix => queryMonitor(() => spawnSync(values['azure-python'], [
      '-IBm', 'azure.cli', 'monitor', 'metrics', 'list', '--resource', values['azure-resource'],
      '--metric', 'AzureOpenAIRequests', '--interval', 'PT1M', '--aggregation', 'Total',
      '--filter', filter + suffix, '--start-time', utcIso(start), '--end-time', utcIso(bucket(capturedAt) + minute),
      '--only-show-errors', '-o', 'json',
    ], { encoding: 'utf8', timeout: 30_000 }));
    const total = await read('');
    const status = await read(" and StatusCode eq '*'");
    // Store only dimensions and points, omitting resource identifiers.
    const relevant = doc => ({ interval: doc.interval, value: doc.value.map(({ name, timeseries }) => ({ name, timeseries })) });
    writeFileSync(`${values['snapshot-prefix']}-${capturedAt}.json`,
      JSON.stringify({ capturedAt: utcIso(capturedAt), total: relevant(total), status: relevant(status) }), { flag: 'wx' });
    return { ...snapshot(total, status, values.deployment, start, end), capturedAt };
  }
  let first = await capture();
  if (first.result === 'unexplained') return 'unexplained';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (Date.now() + 61_000 >= confirmedUntil) return 'incomplete';
    await delay(61_000);
    const second = await capture();
    const result = reconcileTraffic(first, second, starts, start, end, confirmedUntil);
    if (result !== 'incomplete') return result;
    first = second;
  }
  return 'incomplete';
}

export { snapshot };

async function main() {
  const { values } = parseArgs({ options: {
    metrics: { type: 'string' }, journal: { type: 'string' },
    start: { type: 'string' }, end: { type: 'string' }, 'label-offset': { type: 'string' },
    'azure-python': { type: 'string' }, 'azure-resource': { type: 'string' },
    deployment: { type: 'string' }, 'confirmed-until': { type: 'string' },
    'snapshot-prefix': { type: 'string' },
  } });
  let result;
  if (values['azure-resource']) {
    if (values.metrics || values['label-offset']) throw Error('Mixed Monitor modes');
    result = await liveCheck(values);
  } else {
    if (!values.metrics || !/^[01]$/.test(values['label-offset'] ?? '')) throw Error('Invalid arguments');
    const points = JSON.parse(readFileSync(values.metrics, 'utf8'));
    if (!Array.isArray(points)) throw Error('Expected exactly one deployment-filtered series');
    result = checkTraffic(points, dispatchTimes(values.journal),
      utc(values.start), utc(values.end), Number(values['label-offset']));
  }
  console.log(JSON.stringify({ event: 'controlled_image_traffic', result }));
  process.exitCode = result === 'matched' || result === 'boundary_uncertain' ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await main();
  } catch {
    console.error('Traffic verification failed. Review the local snapshot and journal.');
    process.exitCode = 1;
  }
}
