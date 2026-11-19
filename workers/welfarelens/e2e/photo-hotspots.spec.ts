import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function uploadFixture(page: Page, portrait: boolean, orientation?: number) {
    const pixels = await page.evaluate(({portrait, orientation}) => {
        const canvas = document.createElement('canvas');
        canvas.width = portrait ? 480 : 800;
        canvas.height = portrait ? 720 : 480;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#e8dfce';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#4c3025';
        ctx.fillRect(.22 * canvas.width, .22 * canvas.height, .18 * canvas.width, .45 * canvas.height);
        ctx.fillStyle = '#244d40';
        ctx.fillRect(.30 * canvas.width, .25 * canvas.height, .28 * canvas.width, .3 * canvas.height);
        ctx.fillStyle = '#131c15';
        ctx.font = '22px sans-serif';
        ctx.fillText('SYNTHETIC TEST IMAGE', 20, 34);
        return canvas.toDataURL('image/jpeg').split(',')[1];
    }, {portrait, orientation});
    let buffer = Buffer.from(pixels, 'base64');
    if (orientation) {
        const exif = Buffer.from('ffe100224578696600004d4d002a00000008000101120003000000010000000000000000', 'hex');
        exif.writeUInt16BE(orientation, 28);
        buffer = Buffer.concat([buffer.subarray(0, 2), exif, buffer.subarray(2)]);
    }
    await page.locator('input[type=file]:not([capture])').setInputFiles({name:'synthetic.jpg', mimeType:'image/jpeg', buffer});
}

const cable = {kind:'cord', label:'測試線材', bbox:[.22,.22,.40,.67], notes:'測試圖棕色區域'};
const windowObject = {kind:'window', label:'測試窗戶', bbox:[.30,.25,.58,.55], notes:'測試圖綠色區域'};
const finding = (rule_id: string, index: number, keys: string[]) => ({
    rule_id, object_indices:[index],
    facts:keys.map(key => ({key, value:true, status:'OBSERVATION', evidence:'合成測試條件', confidence:'high'})),
});

for (const width of [1280, 375]) test(`numbering, correction, zoom and simulation ${width}`, async ({page}, testInfo) => {
    await page.setViewportSize({width,height:900});
    const candidate = {image_quality:'adequate', questions:[], limitations:[],
        objects:width === 375 ? [cable, windowObject, {...cable, label:'未定位線材', bbox:null}] : [cable],
        assessments:[finding('H04',0,['exposed_cord','reachable']), ...(width === 375 ? [
            finding('H01',1,['opening_visible','access_route']), finding('H04',2,['exposed_cord','reachable'])
        ] : [])]};
    await page.route('**/api/analyze', route => route.fulfill({json:{candidate}}));
    await page.goto('/photo');
    await uploadFixture(page, width === 375);
    const photo = page.locator('.scan-photo-markers img');
    const overlay = page.locator('.scan-hotspots');
    const cards = page.locator('.complete-findings article');
    const marker = page.getByRole('button',{name:/標記 \d：測試線材/});
    await expect(overlay.locator('button')).toHaveCount(width === 375 ? 2 : 1);
    await marker.click();
    const card = cards.filter({hasText:'測試線材'});
    await expect(card).toHaveAttribute('data-selected','true');
    const number = await marker.innerText();
    await expect(card.locator('.action-number')).toHaveText(number);
    if (width === 375) {
        await cards.filter({hasText:'測試窗戶'}).getByRole('button',{name:/選取/}).click();
        await expect(page.getByRole('button',{name:/標記 \d：測試窗戶/})).toHaveAttribute('aria-pressed','true');
    }
    await page.getByRole('button',{name:'顯示標記'}).click();
    await expect(marker).toBeHidden();
    await page.getByRole('button',{name:'顯示標記'}).click();

    for (const zoom of ['1','1.5']) {
        await page.getByLabel('照片縮放').selectOption(zoom);
        const box = await photo.boundingBox(), outline = await marker.locator('..').locator('.scan-hotspot-outline').boundingBox();
        expect(Math.abs((outline!.x - box!.x) / box!.width - .22)).toBeLessThan(.005);
        expect(Math.abs((outline!.height / box!.height) - .45)).toBeLessThan(.005);
        expect((await marker.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    }
    await page.getByLabel('照片縮放').selectOption('1');
    const toLocate = width === 375 ? cards.filter({hasText:'未定位線材'}) : card;
    if (width === 375) await expect(toLocate).toContainText('此項目尚未定位');
    await toLocate.getByRole('button',{name:width === 375 ? '在照片上標記位置' : '修正位置'}).click();
    const bounds = await photo.boundingBox();
    await page.locator('.scan-location-target').click({position:{x:bounds!.width*.72,y:bounds!.height*.36}});
    await expect(toLocate).toContainText('使用者確認位置');
    await card.getByRole('button',{name:'模擬改善'}).click();
    await expect(card).toContainText('潛在風險 → 此規則未辨識風險');
    await expect(card).toContainText('現實狀態待重新驗證');
    await expect(marker.locator('..')).toHaveClass(/simulated/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.scan-results').scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath(`photo-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'顯示標記'}).click();
    await page.emulateMedia({media:'print'});
    await expect(marker).toBeVisible();
    await page.pdf({path:testInfo.outputPath(`photo-${width}.pdf`),printBackground:true});
});

test('EXIF rotation is baked into the analysis JPEG and legacy empty findings render', async ({page}) => {
    let dimensions = '';
    await page.route('**/api/analyze', async route => {
        dimensions = await page.evaluate(async src => {
            const img = new Image();
            img.src = src;
            await img.decode();
            return `${img.naturalWidth}x${img.naturalHeight}`;
        }, route.request().postDataJSON().imageDataUrl);
        await route.fulfill({json:{candidate:{objects:[], questions:[], limitations:[], image_quality:'adequate'}}});
    });
    await page.goto('/photo');
    await uploadFixture(page, false, 6);
    await expect(page.locator('.scan-results')).toContainText('這張照片未發現');
    expect(dimensions).toBe('480x800');
    await expect(page.locator('.scan-hotspots button')).toHaveCount(0);
});

test('local demo runs without a cloud request', async ({page}) => {
    const requests: string[] = [];
    page.on('request', request => {
        if (/\/api\/(analyze|improve)$/.test(request.url())) requests.push(request.url());
    });
    await page.goto('/photo');
    await page.getByRole('button', {name:'試用虛構場景'}).click();
    await expect(page.getByText('虛構場景與測試資料 · 本次示範未呼叫 Azure')).toBeVisible();
    await expect(page.locator('.scan-marker-legend')).toContainText('示範座標');
    await page.getByRole('button', {name:'模擬改善', exact:true}).click();
    await expect(page.locator('.scan-simulation-state')).toBeVisible();
    expect(requests).toEqual([]);
});
