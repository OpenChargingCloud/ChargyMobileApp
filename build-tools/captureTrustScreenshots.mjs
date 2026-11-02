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
    'output-dir': { type: 'string', default: path.join(repo, 'documentation/screenshots/trust-anchor') }
} });
const build = path.resolve(values['build-dir']);
const output = path.resolve(values['output-dir']);
const fixtures = path.join(repo, 'tests/fixtures/TrustAnchors');
const anchor = (await readFile(path.join(fixtures, 'compact.txt'), 'utf8')).trim();
const statement = await readFile(path.join(fixtures, 'key-statement.json'), 'utf8');
const viewport = { width: 1280, height: 1000 };
const fixedTime = '2026-10-31T12:00:00.000Z';
const sourceURL = 'https://poi.example/RNs/CHARGY-TA-TEST/keyStatement';
const imageNames = ['step-1-preview.png', 'step-2-key-statement.png'];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
               '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.map': 'application/json' };
await readFile(path.join(build, 'index.html')); // Fail before opening a browser if the build is missing.
await mkdir(output, { recursive: true });

const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
        const file = path.resolve(build, '.' + relative);
        if (!file.startsWith(build + path.sep)) {
            response.writeHead(403).end();
            return;
        }
        const bytes = await readFile(file);
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(bytes);
    }
    catch {
        if (!response.headersSent)
            response.writeHead(404);
        response.end();
    }
});
await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
let browser;
try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport, locale: 'en-US', timezoneId: 'UTC', deviceScaleFactor: 1,
        colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
    const failures = [];
    let downloads = 0;
    const transparentPNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    await context.addInitScript(() => { window.NativeFile = window.File; });
    await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin) {
            await route.continue();
        }
        else if (request.url() === sourceURL) {
            downloads++;
            await route.fulfill({ body: statement, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
        }
        else if (url.origin === 'https://chargy.charging.cloud') {
            await route.fulfill({ json: { versions: [] }, headers: { 'Access-Control-Allow-Origin': '*' } });
        }
        else if (request.resourceType() === 'image') {
            // The screenshots contain only the opaque dialog; background map tiles are irrelevant.
            await route.fulfill({ body: transparentPNG, contentType: 'image/png' });
        }
        else {
            failures.push(`Unexpected external request: ${request.url()}`);
            await route.abort();
        }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    await page.clock.setFixedTime(new Date(fixedTime));
    await page.goto(`${origin}/?verify=${Buffer.from(anchor).toString('base64url')}`, { waitUntil: 'networkidle' });
    assert.match(await page.title(), /Chargy/);
    assert.equal(await page.locator('webpack-dev-server-client-overlay').count(), 0);
    const dialog = page.locator('#qrCodeScanner');
    const content = dialog.locator('#qrCodeScannerTrustAnchorPreview');
    const frame = dialog.locator('.overlayText');
    await dialog.getByRole('button', { name: 'Import', exact: true }).waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await content.getAttribute('data-stage'), 'preview');
    assert.equal(await content.locator('.securityFingerprintImage').count(), 3);
    assert.equal(await content.locator('.trustAnchorValidation').count(), 0);
    assert.equal(downloads, 0);
    assert.equal(await page.evaluate(async () => (await indexedDB.databases()).some(database => database.name === 'ChargyTrustManagement')), false);
    await dialog.locator('.data').evaluate(element => { element.scrollTop = 0; });
    await frame.screenshot({ path: path.join(output, imageNames[0]), animations: 'disabled', scale: 'css' });

    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await content.locator('.trustAnchorLoadedData').waitFor({ state: 'visible' });
    assert.equal(downloads, 1);
    for (const [check, state] of Object.entries({ signatures: 'valid', signers: 'invalid', quorum: 'invalid', validity: 'valid' }))
        assert.equal(await content.locator(`[data-check="${check}"]`).getAttribute('data-state'), state);
    assert.match(await content.locator('[data-check="quorum"]').innerText(), /0 \/ 2/);
    assert.equal(await content.locator('[data-key-trust="manual"]').count(), 0);
    await page.evaluate(() => document.fonts.ready);
    await dialog.locator('.data').evaluate(element => { element.scrollTop = 0; });
    await frame.screenshot({ path: path.join(output, imageNames[1]), animations: 'disabled', scale: 'css' });
    assert.deepEqual(failures, []);
    await writeFile(path.join(output, 'capture-info.json'), JSON.stringify({
        command: 'npm run docs:screenshots', locale: 'en-US', timezone: 'UTC', viewport, fixedTime,
        browser: browser.version(), fixture: 'tests/fixtures/TrustAnchors/key-statement.json',
        fixtureSHA256: createHash('sha256').update(statement).digest('hex'), sourceURL,
        screenshots: imageNames,
        states: { step1: 'Anchor content only; no POI download or trust storage access', step2: 'Valid signatures; unknown signers; trusted quorum 0/2' }
    }, null, 2) + '\n');
    console.log(`Captured ${imageNames.length} documentation screenshots in ${output}`);
    await context.close();
}
finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
