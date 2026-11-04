// Explicit one-off import from public Taiwanese product pages. Never store the
// page body, ingredients, claims, feeding guides or full productData payload.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root = path.resolve(import.meta.dirname, '..');
const sitemap = 'https://www.royalcanin.com/tw/zh-tw/sitemap/sitemap-products.xml';
const priceFile = path.join(root, 'src/lib/hq/food/prices.json');
const prices = JSON.parse(await readFile(priceFile, 'utf8'));
const checkedOn = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
async function get(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['www.royalcanin.com', 'marspetcareaprimocdn.petcare.global', 'cdn.royalcanin-weshare-online.io', 'p1.aprimocdn.net'].includes(parsed.hostname)) throw new Error('Unsupported source host');
  for (let attempt = 0; attempt < 3; attempt++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r; }
    catch (e) { if (attempt === 2) throw e; }
  }
}
const xml = await (await get(sitemap)).text();
const urls = [...new Set([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(x => x[1].replaceAll('&amp;', '&')).filter(u => /\/tw\/cats\/products\/(retail|vet)-products\/[^/]+-\d+$/.test(u)))];
if (urls.length < 39) throw new Error(`Incomplete sitemap: ${urls.length}`);
const products = [], failures = [];
await mkdir(path.join(root, 'public/hq-food/royalcanin'), { recursive: true });
let cursor = 0;
async function worker() {
  while (cursor < urls.length) {
    const url = urls[cursor++];
    try {
      const html = await (await get(url)).text();
      const data = JSON.parse(html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1] ?? '{}');
      const p = data.props?.pageProps?.productData?.response;
      if (!p?.title || !p?.species?.includes('cat') || !p?.images?.[0]?.url) throw new Error('Missing cat product identity/image');
      const source = p.original_product ?? {};
      const id = `royalcanin-${p.mainItem}`;
      const image = `/hq-food/royalcanin/${p.mainItem}.webp`;
      const destination = path.join(root, 'public', image);
      const exists = await access(destination).then(()=>true,()=>false);
      if (!exists) {
        const buffer = Buffer.from(await (await get(p.images[0].url)).arrayBuffer());
        await sharp(buffer).resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(destination);
      }
      const category = p.technology === 'dry' ? 'dry' : p.technology === 'wet' ? 'wet' : p.technology === 'liquid' ? 'liquid' : 'other';
      const sterilized = source.sterilized;
      const price = prices[String(p.mainItem)] ?? null;
      // Official zeros mean "no ecommerce price", never a free virtual product.
      products.push({ id, officialId: String(p.mainItem), brand: 'royalcanin', name: p.title.trim(), category,
        image, imageSourceUrl: p.images[0].url, officialUrl: `https://www.royalcanin.com${data.props.pageProps.layoutData.sitecore.context.canonicalUrl}`,
        packs: p.packs.map(x => ({ label: x.size, ean: x.ean })), ages: p.lifestages ?? [],
        needs: (source.specific_needs ?? []).map(x => ({ code: x.code, label: x.label })),
        neutered: typeof sterilized === 'boolean' ? [{ code: sterilized ? 'neutered' : 'intact', label: sterilized ? '已絕育' : '未絕育' }] : [],
        requiresVetDiagnosis: Boolean(p.isVetProduct || url.includes('/vet-products/')),
        currency: 'TWD', referencePrice: price, importedOn: checkedOn });
      console.log(`${products.length}/${urls.length} ${p.title.trim()}`);
    } catch(e) { failures.push({ url, error: String(e) }); console.error('FAILED', url, String(e)); }
  }
}
await Promise.all([worker(), worker(), worker()]);
products.sort((a,b) => Number(a.officialId) - Number(b.officialId));
if (new Set(products.map(p => p.id)).size !== products.length) throw new Error('Duplicate official IDs');
const report = { source: sitemap, importedOn: checkedOn, discovered: urls.length, imported: products.length, failures,
  categories: Object.fromEntries(['dry','wet','liquid','other'].map(c=>[c,products.filter(p=>p.category===c).length])) };
await writeFile(path.join(root, 'src/lib/hq/food/import-report.json'), JSON.stringify(report, null, 2)+'\n');
if (failures.length) throw new Error(`Import incomplete: ${failures.length}; previous catalog preserved. See import-report.json`);
await writeFile(path.join(root, 'src/lib/hq/food/products.json'), JSON.stringify(products, null, 2)+'\n');
console.log(JSON.stringify(report));
