import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createAnalyzeHandler } from '../src/server/azure.ts';
if (!process.argv.includes('--consent'))
    throw Error('Explicit consent required');
const dir = process.argv[process.argv.indexOf('--output') + 1];
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const start = performance.now();
await page.setContent(await readFile(new URL('../public/demo-room.svg', import.meta.url), 'utf8'));
const bytes = await page.screenshot({ type: 'jpeg', quality: 82 });
const processingMs = performance.now() - start;
await browser.close();
const samples = [];
for (let i = 0; i < 3; i++) {
    const t = performance.now();
    const response = await createAnalyzeHandler(process.env)(new Request('http://localhost:3100/api/analyze', { method: 'POST', headers: { origin: 'http://localhost:3100', 'content-type': 'application/json' }, body: JSON.stringify({ consent: true, imageDataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}` }) }));
    const data = await response.json();
    samples.push({ status: response.status, code: data.code, vlmMs: data.latencyMs, timings: data.timings, usage: data.usage, totalMs: performance.now() - t, plants: data.plants, scan: data.scan });
}
const sorted = samples.map(s => s.totalMs).sort((a, b) => a - b);
const result = { fixture: 'project-owned fictional illustration; not plant accuracy evidence', n: 3, processingMs, samples, p50: sorted[1], p95: sorted[2], percentiles: 'nearest rank, n=3 exploratory only' };
await writeFile(`${dir}/benchmark.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
