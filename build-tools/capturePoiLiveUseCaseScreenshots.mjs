// Browser plugin not available: Playwright captures the actual app and genuine signed fixtures.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const repo = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: {
    'build-dir': { type: 'string', default: path.join(repo, 'platforms/browser/www') },
    'output-dir': { type: 'string', default: path.join(repo, 'documentation/screenshots/poi-live-use-case') }
} });
const build = path.resolve(values['build-dir']);
const output = path.resolve(values['output-dir']);
const fixturePaths = {
    anchor: 'tests/fixtures/TrustAnchors/compact.txt',
    statement: 'tests/fixtures/TrustAnchors/key-statement.json',
    initial: 'tests/fixtures/ChargeTransparencyLive/OCMF-Test-01/OCMF-Test-01__0000.json',
    first: 'tests/fixtures/ChargeTransparencyLive/OCMF-Test-01/OCMF-Test-01__0001.json'
};
const fixtures = Object.fromEntries(await Promise.all(Object.entries(fixturePaths).map(async ([key, file]) =>
    [key, await readFile(path.join(repo, file), 'utf8')])));
const viewport = { width: 1280, height: 1000 };
const fixedTime = '2026-09-09T00:50:41.000Z';
const imageNames = ['01-trust-ready.png', '02-live-waiting.png', '03-first-reading.png'];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.map': 'application/json' };
await readFile(path.join(build, 'index.html'));
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        const file = path.resolve(build, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
        if (!file.startsWith(build + path.sep)) {
            response.writeHead(403).end();
            return;
        }
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(await readFile(file));
    }
    catch { if (!response.headersSent) response.writeHead(404); response.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
let browser;
let releaseReading;
const readingAllowed = new Promise(resolve => { releaseReading = resolve; });
try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport, locale: 'en-US', timezoneId: 'UTC', deviceScaleFactor: 1,
        colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
    const failures = [];
    let liveRequests = 0;
    await context.addInitScript(() => { window.NativeFile = window.File; });
    await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if (url.href === 'https://poi.example/RNs/CHARGY-TA-TEST/keyStatement')
            return route.fulfill({ body: fixtures.statement, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
        if (url.origin === 'https://api1.example.com') {
            if (request.method() === 'OPTIONS')
                return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
            liveRequests++;
            await readingAllowed;
            return route.fulfill({ body: fixtures.first, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
        }
        if (url.origin === 'https://chargy.charging.cloud')
            return route.fulfill({ json: { versions: [] }, headers: { 'Access-Control-Allow-Origin': '*' } });
        if (request.resourceType() === 'image')
            return route.fulfill({ body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'), contentType: 'image/png' });
        failures.push(`Unexpected external request: ${url.origin}${url.pathname}`);
        return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    await page.clock.setFixedTime(new Date(fixedTime));
    await page.goto(`${origin}/?verify=${Buffer.from(fixtures.anchor.trim()).toString('base64url')}`, { waitUntil: 'networkidle' });
    assert.match(await page.title(), /Chargy/);
    const dialog = page.locator('#qrCodeScanner');
    const preview = dialog.locator('#qrCodeScannerTrustAnchorPreview');
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await preview.locator('.trustAnchorLoadedData').waitFor();
    // User actions authorize one key of each holder. No storage or verification outcomes are injected.
    for (const id of ['01565176601c895cad856c02c18a1c14eb9f49b26e2fdcae7040c2530350982b',
        '72d16fafc7e5497618246178631d650fef01a4aca770c965dd8b551760bad6dc']) {
        const key = preview.locator(`.anchorKeyTrustKey[data-key-id="${id}"]`);
        await key.locator('[data-action="accept-key"]').click();
        await key.locator('[data-action="confirm-key"]').click();
        await key.locator('[data-key-trust="manual"]').waitFor();
    }
    for (const check of ['signatures', 'signers', 'quorum', 'validity'])
        assert.equal(await preview.locator(`[data-check="${check}"]`).getAttribute('data-state'), 'valid');
    await page.evaluate(() => document.fonts.ready);
    await dialog.locator('.data').evaluate(element => { element.scrollTop = 0; });
    await dialog.locator('.overlayText').screenshot({ path: path.join(output, imageNames[0]), animations: 'disabled', scale: 'css' });

    await page.goto(`${origin}/?verify=${Buffer.from(fixtures.initial).toString('base64url')}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.chargeTransparencyLiveLink').waitFor();
    await page.locator('#liveLinkTrustDialog:visible').waitFor();
    while (await page.locator('#liveLinkTrustDialog:visible .trustOrigin:not(.decided)').count() > 0)
        await page.locator('#liveLinkTrustDialog:visible .trustOrigin:not(.decided) .trustChoice.once').first().click();
    await page.locator('#liveLinkTrustDialog').waitFor({ state: 'hidden' });
    if (liveRequests === 0) {
        const requested = page.waitForRequest(request => new URL(request.url()).origin === 'https://api1.example.com' && request.method() === 'GET');
        await page.getByText('Retry now', { exact: true }).click();
        await requested;
    }
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('webpack-dev-server-client-overlay').count(), 0);
    assert.equal(JSON.parse(fixtures.initial).signedMeterValues, undefined);
    await page.screenshot({ path: path.join(output, imageNames[1]), animations: 'disabled', scale: 'css' });
    releaseReading();
    const reading = page.locator('.measurementValueRows > .measurementValue');
    await reading.waitFor({ state: 'visible' });
    assert.equal(await reading.count(), 1);
    assert.equal(await reading.locator('.fa-check-circle').count(), 1);
    assert.equal(liveRequests, 1);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, imageNames[2]), animations: 'disabled', scale: 'css' });
    assert.deepEqual(failures, []);
    await writeFile(path.join(output, 'capture-info.json'), JSON.stringify({
        command: 'npm run docs:screenshots:poi-live', locale: 'en-US', timezone: 'UTC', viewport, fixedTime,
        browser: browser.version(), screenshots: imageNames,
        fixtures: Object.fromEntries(Object.entries(fixturePaths).map(([key, file]) =>
            [key, { path: file, sha256: createHash('sha256').update(fixtures[key]).digest('hex') }])),
        states: { trust: 'Genuine KeyStatement; two holders explicitly authorized through the UI',
            waiting: 'Genuine signed live link; no readings; first response held until capture',
            firstReading: 'Genuine first HTTPS update processed by the existing Core/UI; this legacy fixture has no matching POI evidence; association remains unproven' }
    }, null, 2) + '\n');
    console.log(`Captured ${imageNames.length} use-case screenshots in ${output}`);
    await context.close();
}
finally {
    releaseReading();
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
