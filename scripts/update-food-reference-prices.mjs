// Manually transcribed Taiwan retailer observations, not an ecommerce crawler.
// Run after reviewing source pages; only exact product codes and official packs match.
import { readFile, writeFile } from 'node:fs/promises';
const folder = new URL('../src/lib/hq/food/', import.meta.url);
const products = JSON.parse(await readFile(new URL('products.json', folder), 'utf8'));
const prices = JSON.parse(await readFile(new URL('prices.json', folder), 'utf8'));
const retail = 'https://www.mianhua-pet.com.tw/129.html';
const vet = 'https://www.mianhua-pet.com.tw/130.html';
const wet = 'https://www.mianhua-pet.com.tw/335.html';
const rows = [
  ['A30+11','2 kg',849,retail],['A30+15','2 kg',849,retail],['IN27','2 kg',829,retail],
  ['IN+7','1.5 kg',659,retail],['E33','2 kg',879,retail],['E35','2 kg',879,retail],['E42','2 kg',879,retail],
  ['F32','2 kg',829,retail],['S37','2 kg',849,retail],['S30+11','2 kg',849,retail],['S36+7','1.5 kg',669,retail],
  ['S33','2 kg',849,retail],['RD32','2 kg',829,retail],['BSK38','2 kg',859,retail],['P30','2 kg',829,retail],
  // The retailer mislabels BS34 as American shorthair: omitted to avoid ambiguity.
  ['BG40','2 kg',849,retail],['IH34','2 kg',869,retail],['UC33','2 kg',849,retail],['O30','1.5 kg',659,retail],
  ['HS33','2 kg',869,retail],['L40','1.5 kg',669,retail],
  ['LP34','1.5 kg',739,vet],['UMC34','1.5 kg',699,vet],['SC27','1.5 kg',819,vet],['DR25','2.5 kg',1299,vet],
  ['AN24','2 kg',1179,vet],['DS46','1.5 kg',779,vet],['GI32','2 kg',999,vet],['GIK35','2 kg',999,vet],
  ['GIM35','2 kg',1039,vet],['FR31','2 kg',1049,vet],['HF26','2 kg',1039,vet],['RF23','2 kg',1069,vet],
  ['RSE24','2 kg',1079,vet],['RSF26','2 kg',1069,vet],['ER28','1.5 kg',669,vet],['WK32','1.5 kg',629,vet],
  ['NSB35','1.5 kg',629,vet],['DE29','1.5 kg',679,vet],
  ...['DS46W','LP34W','UMC34W','RF23W','RF23FW','RF23CW','GI32W','GIM35W','SC27W','ER28W'].map(code=>[code,'1 x 85 g',50,wet]),
];
for (const [code,pack,amount,url] of rows) {
  const matches=products.filter(p=>p.name.split(/\s+/).includes(code));
  if(matches.length!==1) { console.log('SKIP ambiguous code',code); continue; }
  const p=matches[0];
  if(!p.packs.some(x=>x.label===pack)) { console.log('SKIP package mismatch',code,pack); continue; }
  prices[p.officialId]={amount,pack,source:'棉花寵物商城',url,checkedOn:'2026-11-04',note:'人工查閱通路目錄之參考價，非即時報價，運費另計'};
}
// The official pack is three bottles. Explicitly estimated from the retailer's
// single-bottle price, not presented as an observed bundle selling price.
const liquid=products.find(p=>p.officialId==='4951');
if(liquid?.packs.some(p=>p.label==='3 x 200 ml')) prices['4951']={amount:627,pack:'3 x 200 ml',source:'棉花寵物商城',url:'https://www.mianhua-pet.com.tw/336.html',checkedOn:'2026-11-04',note:'估算：單瓶 200 ml TWD 209 × 3；非通路整組售價'};
for(const p of products) p.referencePrice=prices[p.officialId]??null;
const bone='https://www.bonebone.com.tw/categories/%E7%9A%87%E5%AE%B6%E8%B2%93%E6%BF%95%E7%B3%A7-85g195g%E5%B9%BC%E8%B2%93%E5%A5%B6%E7%B2%89';
const extra=[
  ['1278','12 x 85 g',504,bone],['1305','1 x 85 g',42,bone],
  ['1517','1 x 85 g',42,bone],['1518','1 x 85 g',42,bone],['1519','1 x 85 g',42,bone],
  ['4059','1 x 85 g',42,bone],['4070','12 x 85 g',504,bone],['4071','12 x 85 g',504,bone],
  ['4076','12 x 85 g',504,bone],['4083','1 x 85 g',42,bone],['4095','12 x 85 g',504,bone],
  ['4157','12 x 85 g',504,bone],['4158','12 x 85 g',504,bone],['2553','1 x 300 g',910,bone],
  ['2557','2 kg',855,'https://www.bonebone.com.tw/categories/%E5%93%81%E7%A8%AE%E8%A8%82%E8%A3%BD%E8%B2%93%E7%B3%BB%E5%88%97-15kg4kg'],
  ...['1606','8074','8077'].map(id=>[id,'1 x 85 g',53,'https://shop.petpark.com.tw/catalogsearch/result/index/?main_category=616&q=%E7%9A%87%E5%AE%B6']),
];
for(const [id,pack,amount,url] of extra) {
  const p=products.find(x=>x.officialId===id);
  if(!p?.packs.some(x=>x.label===pack)) throw new Error('Package mismatch: '+id);
  prices[id]={amount,pack,source:url.includes('petpark')?'寵物公園':'BONEBONE',url,checkedOn:'2026-11-04',note:'人工查閱台灣通路目錄參考價，非即時報價，運費另計'};
}
for(const p of products) p.referencePrice=prices[p.officialId]??null;
await writeFile(new URL('prices.json',folder),JSON.stringify(prices,null,2)+'\n');
await writeFile(new URL('products.json',folder),JSON.stringify(products,null,2)+'\n');
console.log('Priced',products.filter(p=>p.referencePrice).length,'/',products.length);
