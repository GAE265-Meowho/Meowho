import { writeFile, mkdir } from 'node:fs/promises';
import { createAnalyzeHandler } from '../src/server/azure.ts';
if (!process.argv.includes('--consent'))
    throw Error('Explicit consent required');
const dir = process.argv[process.argv.indexOf('--output') + 1];
await mkdir(dir, { recursive: true });
const cases = [{ id: 'pothos', expected: 'TOXIC', url: 'https://www.aspca.org/sites/default/files/styles/medium_image_300x200/public/field/image/plants/devils-ivy-2-r.jpg?itok=lBogzE06' }, { id: 'parlor-palm', expected: 'NON_TOXIC', url: 'https://www.aspca.org/sites/default/files/styles/medium_image_300x200/public/field/image/plants/good-luck-palm-r.jpg?itok=S-4GDYaE' }];
const results = [];
for (const item of cases) {
    const image = await fetch(item.url);
    if (!image.ok)
        throw Error('Reference image unavailable');
    const bytes = Buffer.from(await image.arrayBuffer());
    const response = await createAnalyzeHandler(process.env)(new Request('http://localhost:3100/api/analyze', { method: 'POST', headers: { origin: 'http://localhost:3100', 'content-type': 'application/json' }, body: JSON.stringify({ consent: true, imageDataUrl: 'data:image/jpeg;base64,' + bytes.toString('base64') }) }));
    const data = await response.json();
    results.push({ id: item.id, source: item.url, expected: item.expected, status: response.status, code: data.code, plants: data.scan?.plants, quality: data.scan?.quality, timings: data.timings, usage: data.usage, hypotheses: data.candidate?.plants, match: data.scan?.plants?.some((p: {
            status: string;
        }) => p.status === item.expected) ?? false });
}
await writeFile(dir + '/plant-live.json', JSON.stringify({ note: 'Two official closeups, not independent room-photo accuracy evaluation. Source name never sent to model.', results }, null, 2));
console.log(JSON.stringify(results));
