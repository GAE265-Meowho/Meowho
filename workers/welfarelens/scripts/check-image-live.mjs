// Explicit one-request Azure edit smoke test. Uses only the project-owned SVG.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';

if (!process.argv.includes('--consent')) throw new Error('Explicit --consent required for one billable Azure image edit.');
const outputIndex = process.argv.indexOf('--output');
if (outputIndex < 0 || !process.argv[outputIndex + 1]) throw new Error('--output DIRECTORY required.');
const output = resolve(process.argv[outputIndex + 1]);
const endpoint = new URL(process.env.AZURE_IMAGE_ENDPOINT || '');
if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.openai.azure.com') ||
    endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
    !['/', '/openai/v1', '/openai/v1/'].includes(endpoint.pathname)) {
  throw new Error('Expected an Azure HTTPS resource root or /openai/v1/ base URL. No request sent.');
}
if (!process.env.AZURE_IMAGE_API_KEY || !process.env.AZURE_IMAGE_DEPLOYMENT) throw new Error('Missing image key/deployment.');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let before;
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await page.setContent('<style>html,body{margin:0}</style>' + await readFile(new URL('../public/demo-room.svg', import.meta.url), 'utf8'));
  before = await page.screenshot({ type: 'png' });
} finally { await browser.close(); }
await writeFile(join(output, 'before.png'), before);
const form = new FormData();
form.set('model', process.env.AZURE_IMAGE_DEPLOYMENT);
form.set('image', new Blob([before], { type: 'image/png' }), 'fictional-room.png');
form.set('prompt', 'Edit this fictional room illustration. Preserve its window, sofa, plant, room layout, camera viewpoint and flat illustration style. Add exactly one small enclosed cat hideout box on the free floor to the right of the sofa and to the left of the plant, with one visible entrance facing the camera. Do not move or remove other objects. This is a concept illustration only, not evidence of real improvements. Do not add a cat.');
form.set('n', '1');
form.set('size', '1024x1024');
form.set('quality', 'low');
form.set('output_format', 'png');
const started = performance.now();
const response = await fetch(new URL('/openai/v1/images/edits', endpoint), {
  method: 'POST', headers: { 'api-key': process.env.AZURE_IMAGE_API_KEY },
  body: form, redirect: 'error', signal: AbortSignal.timeout(180_000),
});
const result = await response.json().catch(() => ({}));
const report = {
  fixture: 'project-owned fictional SVG rendered to PNG; no private photo',
  deployment: process.env.AZURE_IMAGE_DEPLOYMENT,
  http_status: response.status, latencyMs: Math.round(performance.now() - started),
  quality: 'low', requested_size: '1024x1024', requests: 1,
  usage: result.usage ?? null, generated: false,
  cost: 'Not calculated; Azure price/account billing not verified.',
};
if (!response.ok) {
  report.error_code = result.error?.code ?? 'unknown';
  report.error_param = result.error?.param ?? null;
  process.exitCode = 1;
} else {
  const encoded = result.data?.[0]?.b64_json;
  if (result.data?.length !== 1 || typeof encoded !== 'string') throw new Error('Expected exactly one base64 image; no automatic retry.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid PNG output.');
  report.width = bytes.readUInt32BE(16);
  report.height = bytes.readUInt32BE(20);
  report.bytes = bytes.length;
  await writeFile(join(output, 'after.png'), bytes);
  report.generated = true;
}
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
