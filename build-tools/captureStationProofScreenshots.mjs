// Browser plugin not available: Playwright captures the actual app and genuine signed fixtures.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { parseJSON, prettyJSON, TrustAnchor, KeyStatement } from '@open-charging-cloud/wwcp-poi';

const repo = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: {
    'build-dir': { type: 'string', default: path.join(repo, 'platforms/browser/www') },
    'output-dir': { type: 'string', default: path.join(repo, 'documentation/screenshots/station-proof') }
} });
const build = path.resolve(values['build-dir']);
const output = path.resolve(values['output-dir']);
const fixturePaths = {
    anchor: 'documentation/examples/poi-session-live/trusted-anchor.txt',
    evidence: 'documentation/examples/poi-session-live/evidence.json'
};
const fixtures = Object.fromEntries(await Promise.all(Object.entries(fixturePaths).map(async ([key, file]) =>
    [key, await readFile(path.join(repo, file), 'utf8')])));
const evidence = parseJSON(fixtures.evidence);
const anchor = TrustAnchor.parse(fixtures.anchor);
const proofText = prettyJSON(evidence.chargingStationProof);
const statementText = prettyJSON(evidence.chargingStationProof.roamingNetwork.operator);
const signerIds = KeyStatement.parse(evidence.chargingStationProof.roamingNetwork.operator.keyStatement).signatures.map(signature => signature.keyId);
const viewport = { width: 1280, height: 1000 };
const fixedTime = '2026-10-27T17:20:48.115Z';
const imageNames = ['01-station-result.png', '02-meter-details.png', '03-mobile.png'];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.map': 'application/json' };
await readFile(path.join(build, 'index.html'));
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/blank.html') { response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Storage migration</title>'); return; }
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
let releaseProof = () => {};
try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport, locale: 'en-US', timezoneId: 'UTC', deviceScaleFactor: 1,
        colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
    const failures = [];
    let proofRequests = 0;
    let proofGate = Promise.resolve();
    await context.addInitScript(() => { window.NativeFile = window.File; });
    await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if (url.href === anchor.urls[0] + '/keyStatement')
            return route.fulfill({ body: statementText, contentType: 'application/json' });
        if (url.pathname.startsWith('/RNs/QA/EVSEs/') && url.pathname.endsWith('/proof')) {
            proofRequests++;
            await proofGate;
            return route.fulfill({ body: proofText, contentType: 'application/json' }).catch(() => {});
        }
        if (url.origin === 'https://chargy.charging.cloud')
            return route.fulfill({ json: { versions: [] }, headers: { 'Access-Control-Allow-Origin': '*' } });
        if (request.resourceType() === 'image')
            return route.fulfill({ body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'), contentType: 'image/png' });
        failures.push(`Unexpected request: ${url.origin}${url.pathname}`);
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
    // Explicit user decisions for two independent holders; production roots remain unchanged.
    for (const id of signerIds) {
        const key = preview.locator(`.anchorKeyTrustKey[data-key-id="${id}"]`);
        await key.locator('[data-action="accept-key"]').click();
        await key.locator('[data-action="confirm-key"]').click();
        await key.locator('[data-key-trust="manual"]').waitFor();
    }
    assert.equal(await preview.locator('[data-check="quorum"]').getAttribute('data-state'), 'valid');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    // Recreate a genuine version-1 database from decisions made above, then exercise the real v2 upgrade.
    const anchors = await page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => { const r = indexedDB.open('ChargyTrustManagement'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        const result = await new Promise((resolve, reject) => { const r = db.transaction('trustAnchors').objectStore('trustAnchors').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        db.close(); return result;
    });
    await page.goto(origin + '/blank.html');
    await page.evaluate(async records => {
        await new Promise((resolve, reject) => { const r = indexedDB.deleteDatabase('ChargyTrustManagement'); r.onsuccess = resolve; r.onerror = () => reject(r.error); });
        const db = await new Promise((resolve, reject) => {
            const r = indexedDB.open('ChargyTrustManagement', 1);
            r.onupgradeneeded = () => { r.result.createObjectStore('trustAnchors', { keyPath: 'id' }); r.result.createObjectStore('deletedBundledKeys', { keyPath: 'id' }); };
            r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        });
        await new Promise((resolve, reject) => {
            const tx = db.transaction(['trustAnchors', 'deletedBundledKeys'], 'readwrite');
            for (const record of records) tx.objectStore('trustAnchors').add(record);
            tx.objectStore('deletedBundledKeys').add({ id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
            tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
        });
        db.close();
    }, anchors);
    await page.goto(origin, { waitUntil: 'networkidle' });
    const management = page.locator('#settingsTrustManagement');
    async function enter() {
        await page.locator('#settingsButton').click();
        await page.locator('#settingsTrustManagementEntry').click();
        await management.getByRole('button', { name: 'Roaming networks', exact: true }).click();
        await management.locator('.trustNetworkEntry').click();
        await management.getByRole('button', { name: 'Check charging station', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.poiStationForm button[type=submit]')?.disabled === false);
    }
    await enter();
    const migration = await page.evaluate(async () => {
        const db = await new Promise(resolve => { const r = indexedDB.open('ChargyTrustManagement'); r.onsuccess = () => resolve(r.result); });
        const tx = db.transaction('deletedBundledKeys');
        const excluded = await new Promise(resolve => { const r = tx.objectStore('deletedBundledKeys').get('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'); r.onsuccess = () => resolve(r.result); });
        const result = { version: db.version, stores: [...db.objectStoreNames], excluded }; db.close(); return result;
    });
    assert.equal(migration.version, 2);
    assert.ok(migration.stores.includes('poiStationProofs'));
    assert.ok(migration.excluded);
    const input = page.locator('#poiStationEVSE');
    const submit = management.getByRole('button', { name: 'Load and verify station proof', exact: true });
    const verdict = management.locator('.poiStationVerdict');
    async function load(id = evidence.EVSEId) { await input.fill(id); await submit.click(); }
    async function complete() { await page.waitForFunction(() => document.querySelector('.poiStationPanel')?.getAttribute('aria-busy') === 'false'); }
    await load();
    await verdict.waitFor(); await complete();
    assert.equal(await verdict.getAttribute('data-state'), 'valid');
    assert.equal(await verdict.locator('.fa-check-circle').count(), 1);
    assert.equal(await management.locator('.poiSavedProof').count(), 1);
    assert.match(await management.locator('.poiStationSaved').textContent(), /saved/i);
    assert.equal(proofRequests, 1);
    const result = management.locator('.poiStationResult');
    assert.match(await result.textContent(), /DE\*GEF\*E1\*1/);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#settingsPage').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: path.join(output, imageNames[0]), animations: 'disabled', scale: 'css' });
    const meterDetails = result.locator(':scope > details').filter({ has: page.locator('summary', { hasText: /^Meter information/ }) }).first();
    await meterDetails.locator(':scope > summary').click();
    await meterDetails.scrollIntoViewIfNeeded();
    assert.match(await meterDetails.textContent(), /DCM-2026-001-1/);
    await page.screenshot({ path: path.join(output, imageNames[1]), animations: 'disabled', scale: 'css' });
    await meterDetails.locator(':scope > summary').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#settingsPage').evaluate(element => { element.scrollTop = 0; });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, imageNames[2]), animations: 'disabled', scale: 'css' });
    await page.setViewportSize(viewport);

    // The cache survives reload, and reopening it re-verifies without network access.
    await page.reload({ waitUntil: 'networkidle' }); await enter();
    assert.equal(await management.locator('.poiSavedProof').count(), 1);
    await management.getByRole('button', { name: 'Open and recheck', exact: true }).click();
    await verdict.waitFor(); await complete();
    assert.equal(await verdict.getAttribute('data-state'), 'valid');
    assert.equal(proofRequests, 1);
    // Duplicate successful retrieval does not multiply records or replace first provenance.
    await load(); await verdict.waitFor(); await complete();
    assert.equal(await management.locator('.poiSavedProof').count(), 1);
    // A valid proof for another EVSE must never become a success for the requested subject.
    await load('DE*GEF*E999*1'); await management.locator('.poiStationFailure').waitFor(); await complete();
    assert.equal(await verdict.count(), 0);
    // Cancellation cannot display or save a late response.
    proofGate = new Promise(resolve => { releaseProof = resolve; });
    const request = page.waitForRequest(r => r.url().endsWith('/proof'));
    await load(); await request;
    await management.getByRole('button', { name: 'Cancel', exact: true }).click();
    releaseProof(); proofGate = Promise.resolve();
    assert.equal(await verdict.count(), 0);
    assert.match(await management.locator('.poiStationMessage').textContent(), /cancel/i);
    // A storage failure preserves the successful verification but explicitly reports unsaved evidence.
    await management.getByRole('button', { name: 'Delete saved proof', exact: true }).click();
    await management.locator('.poiSavedProof').waitFor({ state: 'detached' });
    await page.evaluate(() => {
        window.originalProofAdd = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function (...args) {
            if (this.name === 'poiStationProofs') throw new DOMException('Test quota exhausted', 'QuotaExceededError');
            return window.originalProofAdd.apply(this, args);
        };
    });
    await load(); await verdict.waitFor(); await complete();
    assert.equal(await verdict.getAttribute('data-state'), 'valid');
    assert.equal(await management.locator('.poiStationSaved').count(), 0);
    assert.match(await management.locator('[role=alert]').textContent(), /sav/i);
    await page.evaluate(() => { IDBObjectStore.prototype.add = window.originalProofAdd; delete window.originalProofAdd; });
    await management.getByRole('button', { name: 'Retry', exact: true }).click();
    await management.locator('.poiStationSaved').waitFor(); await complete();
    assert.equal(await management.locator('.poiSavedProof').count(), 1);
    // Withdrawal while the response is in flight must invalidate the actual verification.
    proofGate = new Promise(resolve => { releaseProof = resolve; });
    const beforeWithdrawal = page.waitForRequest(r => r.url().endsWith('/proof'));
    await load(); await beforeWithdrawal;
    async function replaceLocalDecisions(records) {
        await page.evaluate(async values => {
            const db = await new Promise(resolve => { const r = indexedDB.open('ChargyTrustManagement'); r.onsuccess = () => resolve(r.result); });
            await new Promise((resolve, reject) => {
                const tx = db.transaction('trustAnchors', 'readwrite');
                for (const value of values) tx.objectStore('trustAnchors').put(value);
                tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
            });
            db.close();
        }, records);
    }
    await replaceLocalDecisions(anchors.map(record => ({ ...record, trustedKeys: [] })));
    releaseProof(); proofGate = Promise.resolve();
    await management.locator('.poiStationFailure').waitFor(); await complete();
    assert.equal(await verdict.count(), 0);
    await replaceLocalDecisions(anchors);
    // Expired attestations invalidate cached evidence; no persisted green flag can bypass time checks.
    await page.clock.setFixedTime(new Date('2026-10-28T12:00:00Z'));
    await management.getByRole('button', { name: 'Open and recheck', exact: true }).click();
    await management.locator('.poiStationFailure').waitFor(); await complete();
    assert.equal(await verdict.count(), 0);
    await page.clock.setFixedTime(new Date(fixedTime));
    // Navigating back while a request is pending disposes it and suppresses late results.
    proofGate = new Promise(resolve => { releaseProof = resolve; });
    const pending = page.waitForRequest(r => r.url().endsWith('/proof'));
    await load(); await pending; await page.locator('#settingsBackButton').click();
    releaseProof(); proofGate = Promise.resolve();
    await management.locator('.poiStationPanel').waitFor({ state: 'detached' });
    assert.equal(await verdict.count(), 0);
    // Removing the anchor also removes its proof cache, atomically.
    await management.getByRole('button', { name: 'Delete trust anchor', exact: true }).click();
    await management.locator('.trustManagementCard').waitFor({ state: 'detached' });
    const remaining = await page.evaluate(async () => {
        const db = await new Promise(resolve => { const r = indexedDB.open('ChargyTrustManagement'); r.onsuccess = () => resolve(r.result); });
        const count = await new Promise(resolve => { const r = db.transaction('poiStationProofs').objectStore('poiStationProofs').count(); r.onsuccess = () => resolve(r.result); });
        db.close(); return count;
    });
    assert.equal(remaining, 0);
    assert.equal(await page.locator('webpack-dev-server-client-overlay').count(), 0);
    assert.deepEqual(failures, []);
    await writeFile(path.join(output, 'capture-info.json'), JSON.stringify({
        command: 'npm run docs:screenshots:station-proof', locale: 'en-US', timezone: 'UTC', viewport,
        mobileViewport: { width: 390, height: 844 }, fixedTime, browser: browser.version(), screenshots: imageNames,
        fixtures: Object.fromEntries(Object.entries(fixturePaths).map(([key, file]) =>
            [key, { path: file, sha256: createHash('sha256').update(fixtures[key]).digest('hex') }])),
        checks: ['genuine signatures and inclusion proof', 'manual trust for two holders', 'v1 to v2 migration',
            'reload and offline recheck', 'deduplication', 'wrong EVSE', 'cancellation', 'quota failure and retry',
            'trust withdrawal during download', 'expiry', 'navigation during download', 'anchor deletion removes proof cache', 'no console errors'],
        scope: 'Manual station check only. No session/Core handoff, dynamic price or independent-publication verdict.'
    }, null, 2) + '\n');
    console.log(`Captured ${imageNames.length} screenshots and passed station browser regression checks in ${output}`);
    await context.close();
}
finally {
    releaseProof();
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
