import {openMobileSession,mobileBack} from './mobileBrowser.mjs';
import {resetObservedPOIHistory} from './observedHistoryBrowser.mjs';
// Browser plugin not available: Playwright captures the actual app and genuine signed fixtures.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { parseJSON, prettyJSON, TrustAnchor } from '@open-charging-cloud/wwcp-poi';

const repo = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: {
    'build-dir': { type: 'string', default: path.join(repo, 'platforms/browser/www') },
    'output-dir': { type: 'string', default: path.join(repo, 'documentation/screenshots/poi-completed-session') }
} });
const build = path.resolve(values['build-dir']);
const output = path.resolve(values['output-dir']);
const fixturePaths = { session: 'tests/fixtures/POISession/completed-session-with-evse-proof.chargy',
    provenance: 'tests/fixtures/POISession/provenance.json' };
const fixtures = Object.fromEntries(await Promise.all(Object.entries(fixturePaths).map(async ([key, file]) =>
    [key, await readFile(path.join(repo, file), 'utf8')])));
const input = parseJSON(fixtures.session);
const metadata = JSON.parse(fixtures.provenance);
const anchor = TrustAnchor.parse(input.poiEvidence.bootstrap.trustAnchor);
const viewport = { width: 1440, height: 1050 };
const fixedTime = metadata.generatedAt;
const imageNames = ['01-before-trust.png', '02-session-verified.png', '03-static-tariff.png', '04-mobile.png', '05-signed-readings.png', '06-container-key-conflict.png', '07-foreign-meter-key.png'];
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
try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport, locale: 'en-US', timezoneId: 'UTC', deviceScaleFactor: 1,
        colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
    const failures = [];
    let proofRequests = 0;
    let statementRequests = 0;
    await context.addInitScript(() => { window.NativeFile = window.File; });
    await context.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if (url.href === anchor.urls[0] + '/keyStatement') { statementRequests++; return route.abort(); }
        if (url.href === anchor.urls[0] + '/EVSEs/' + metadata.evseId + '/proof') {
            proofRequests++;
            return route.fulfill({ body: prettyJSON(input.poiEvidence.chargingStationProof), contentType: 'application/json' });
        }
        if (url.origin === 'https://chargy.charging.cloud')
            return route.fulfill({ json: { versions: [] }, headers: { 'Access-Control-Allow-Origin': '*' } });
        if (request.resourceType() === 'image')
            return route.fulfill({ body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'), contentType: 'image/png' });
        failures.push(`Unexpected external request: ${url.href}`); return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    await page.clock.setFixedTime(new Date(fixedTime));
    await page.goto(origin, { waitUntil: 'networkidle' });
    assert.match(await page.title(), /Chargy/);
    async function drop(text) { await resetObservedPOIHistory(page);
        const previous=await page.$('.sessionPOI');
        await page.evaluate(text => {
            const transfer = new DataTransfer();
            transfer.items.add(new window.NativeFile([text], 'completed-session-with-evse-proof.chargy', { type: 'application/json' }));
            document.querySelector('#startPage').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
        }, text);await openMobileSession(page);
        if(previous!==null){await page.waitForFunction(element=>!element.isConnected,previous);await previous.dispose();}
    }
    await drop(fixtures.session);
    const panel = page.locator('.sessionPOI');
    await panel.getByRole('button', { name: 'Inspect supplied TrustAnchor …', exact: true }).waitFor();
    const rows = page.locator('.measurementValueRows > .measurementValue');
    assert.equal(await rows.count(), 2);
    assert.equal(await rows.locator('.fa-check-circle').count(), 2);
    assert.equal(await panel.locator('.poiStationVerdict').count(), 0);
    assert.equal(proofRequests, 0); assert.equal(statementRequests, 0);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, imageNames[0]), animations: 'disabled', scale: 'css' });
    await panel.getByRole('button', { name: 'Inspect supplied TrustAnchor …', exact: true }).click();
    const dialog = page.locator('#qrCodeScanner');
    const preview = dialog.locator('#qrCodeScannerTrustAnchorPreview');
    assert.equal(await preview.locator('.trustAnchorLoadedData').count(), 0);
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await preview.locator('.trustAnchorLoadedData').waitFor();
    assert.equal(await preview.locator('[data-check="signatures"]').getAttribute('data-state'), 'valid');
    assert.equal(await preview.locator('[data-check="quorum"]').getAttribute('data-state'), 'invalid');
    for (const id of anchor.keys) {
        const key = preview.locator(`.anchorKeyTrustKey[data-key-id="${id}"]`);
        await key.locator('[data-action="accept-key"]').click();
        await key.locator('[data-action="confirm-key"]').click();
        await key.locator('[data-key-trust="manual"]').waitFor();
    }
    assert.equal(await preview.locator('[data-check="quorum"]').getAttribute('data-state'), 'valid');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    const verdict = panel.locator('.poiStationVerdict');
    const meter = panel.locator('.sessionMeterKeyResult');
    await verdict.waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.querySelector('.sessionPOI .poiStationPanel')?.getAttribute('aria-busy') === 'false');
    assert.equal(await verdict.getAttribute('data-state'), 'valid');
    await panel.locator('.sessionMeterKeyResult[data-check=verified]').waitFor();
    assert.equal(await page.locator('#poiStationEVSE').getAttribute('readonly'), '');
    assert.equal(proofRequests, 0); assert.equal(statementRequests, 0);
    assert.equal(await rows.locator('.fa-check-circle').count(), 2);
    assert.match(await panel.textContent(), /DE\*POI\*E1\*1/);
    await page.screenshot({ path: path.join(output, imageNames[1]), animations: 'disabled', scale: 'css' });
    await panel.locator('.sessionPOIDetails > summary').click();
    const tariff = panel.locator('.poiStationResult > details').filter({ has: page.locator('summary', { hasText: /^Static tariffs for this EVSE/ }) }).first();
    await tariff.locator(':scope > summary').click();
    await tariff.locator('.poiEntityCard details > summary').click();
    await tariff.scrollIntoViewIfNeeded();
    assert.match(await tariff.textContent(), /0\.35/);
    assert.match(await tariff.locator('.poiStaticTariffCheck').textContent(), /proven/);
    await page.screenshot({ path: path.join(output, imageNames[2]), animations: 'disabled', scale: 'css' });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.locator('.sessionPOIDetails > summary').click();
    await panel.locator('.sessionPOIStatus').scrollIntoViewIfNeeded();
    assert.ok((await panel.boundingBox()).width >= 300);
    assert.ok(await page.locator('#measurementInfosPage').isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, imageNames[3]), animations: 'disabled', scale: 'css' });
    await page.setViewportSize(viewport);
    await panel.locator('.sessionPOIDetails > summary').click();
    await panel.locator('.sessionPOIDetails > summary').click();
    await rows.last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, imageNames[4]), animations: 'disabled', scale: 'css' });
    await rows.first().click();
    const cryptoDetails = page.locator('#cryptoDetailsPage');
    await cryptoDetails.waitFor({ state: 'visible' });
    assert.equal(await cryptoDetails.locator('#signatureCheck .fa-check-circle').count(), 1);
    await mobileBack(page);
    // The additive result's own detail buttons must open the newly reverified record too.
    await meter.locator(':scope > details > summary').click();
    await meter.locator(':scope > details > button').first().click();
    await cryptoDetails.waitFor({ state: 'visible' });
    assert.equal(await cryptoDetails.locator('#signatureCheck .fa-check-circle').count(), 1);
    await mobileBack(page);
    await meter.locator(':scope > details > summary').click();
    await panel.locator('.sessionPOIDetails > summary').click();
    // A fresh request still uses only the selected saved policy, with the session's EVSE locked.
    await panel.getByRole('button', { name: 'Load and verify station proof', exact: true }).click();
    await verdict.waitFor({ state: 'attached' });
    assert.equal(await verdict.getAttribute('data-state'), 'valid');
    await panel.locator('.sessionMeterKeyResult[data-check=verified]').waitFor();
    assert.equal(proofRequests, 1);
    // Local trust survives reload. File selection uses the same import path as Drag & Drop.
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#fileInput').setInputFiles({ name: 'completed-session-with-evse-proof.chargy', mimeType: 'application/json', buffer: Buffer.from(fixtures.session) }); await openMobileSession(page);
    await verdict.waitFor({ state: 'attached' });
    assert.equal(await verdict.getAttribute('data-state'), 'valid');
    await panel.locator('.sessionMeterKeyResult[data-check=verified]').waitFor();
    // Both signature checks come from Core's original-document recheck with the proven EVSE key.
    assert.match(await meter.textContent(), /Original readings verified with the proven key/);
    assert.match(await meter.textContent(), /Historical association not proven/);
    assert.equal(statementRequests, 0);
    // Tampered station data cannot replace the genuine proof; mathematical OCMF validity stays separate.
    await drop(fixtures.session.replace('Chargy POI demo station', 'Forged POI demo station'));
    await panel.locator('.poiStationFailure').waitFor({ state: 'attached' });
    assert.equal(await verdict.count(), 0);
    assert.equal(await rows.locator('.fa-check-circle').count(), 2);
    // A supplied association for a different EVSE is diagnosed rather than silently ignored.
    await drop(fixtures.session.replace('"EVSEId": "DE*POI*E1*1"', '"EVSEId": "DE*POI*E9*1"'));
    await page.locator('.sessionPOI[role=alert]').waitFor();
    assert.equal(await verdict.count(), 0);
    assert.equal(await rows.locator('.fa-check-circle').count(), 2);
    // Independent results: a changed end reading fails its signature while the unchanged station proof still verifies.
    await drop(fixtures.session.replace('1011', '1012'));
    await verdict.waitFor({ state: 'attached' });
    assert.equal(await verdict.getAttribute('data-state'), 'valid');
    assert.equal(await rows.locator('.fa-check-circle').count(), 1);
    assert.equal(await rows.locator('.fa-times-circle').count(), 1);
    await panel.locator('.sessionMeterKeyResult[data-check=invalid-signature]').waitFor();
    // Crypto details describe each original reading, not the session's aggregate verdict.
    await meter.locator(':scope > details > summary').click();
    for (const [index, icon] of [[0, '.fa-check-circle'], [1, '.fa-times-circle']]) {
        await meter.locator(':scope > details > button').nth(index).click();
        await cryptoDetails.locator('#signatureCheck ' + icon).waitFor();
        await mobileBack(page);
    }
    // Genuine root proofs with conflicting container material and foreign EVSE keys remain separate claims.
    for (const [name, expected, image] of [
        ['container-key-conflict', 'key-conflict', imageNames[5]],
        ['foreign-meter-key-proof', 'key-conflict', imageNames[6]],
        ['wrong-meter-proof', 'missing', undefined],
        ['ambiguous-meter-keys', 'missing', undefined]
    ]) {
        const text = await readFile(path.join(repo, 'tests/fixtures/POISession', name + '.chargy'), 'utf8');
        await drop(text); await verdict.waitFor({ state: 'attached' });
        assert.equal(await verdict.getAttribute('data-state'), 'valid');
        if (expected === 'missing') {
            await panel.getByText('Meter-key association not proven.', { exact: true }).waitFor();
            assert.equal(await meter.count(), 0);
        }
        else {
            await panel.locator('.sessionMeterKeyResult[data-check="' + expected + '"]').waitFor();
            assert.equal(await meter.getAttribute('data-state'), 'warning');
            if (image !== undefined) {
                await meter.evaluate(element=>element.scrollIntoView({block:'start'}));
                await page.screenshot({ path: path.join(output, image), animations: 'disabled', scale: 'css' });
            }
            if (name === 'container-key-conflict') {
                // Exercise the actual app export fallback and re-import, retaining the original conflicting public key.
                await page.evaluate(() => { window.showSaveFilePicker = undefined; });
                const downloaded = page.waitForEvent('download');
                await page.locator('#exportButton').click();
                const file = await downloaded;
                const exported = await readFile(await file.path(), 'utf8');
                await drop(exported);
                await panel.locator('.sessionMeterKeyResult[data-check=key-conflict]').waitFor();
            }
        }
    }
    // Delay real SHA-256 work (never its result), then withdraw one previously UI-authorized holder.
    await page.evaluate(() => {
        const original = crypto.subtle.digest.bind(crypto.subtle);
        window.meterOriginalDigest = original;
        window.meterDigestHeld = false;
        crypto.subtle.digest = async function (algorithm, data) {
            const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
            const text = new TextDecoder().decode(bytes);
            if (!window.meterDigestHeld && text.includes('"MS":"CHARGY-POI-METER-001"') &&
                document.querySelector('.sessionMeterKey')?.textContent.includes('Associating meter key')) {
                window.meterDigestHeld = true;
                await new Promise(resolve => { window.releaseMeterDigest = resolve; });
            }
            return original(algorithm, data);
        };
    });
    await drop(fixtures.session);
    await page.waitForFunction(() => window.meterDigestHeld === true);
    await page.evaluate(async keyId => {
        const db = await new Promise(resolve => { const r = indexedDB.open('ChargyTrustManagement'); r.onsuccess = () => resolve(r.result); });
        await new Promise((resolve, reject) => {
            const tx = db.transaction('trustAnchors', 'readwrite'); const store = tx.objectStore('trustAnchors');
            const read = store.getAll();
            read.onsuccess = () => { for (const record of read.result) store.put({ ...record, trustedKeys: record.trustedKeys.filter(key => key.id !== keyId) }); };
            tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
        }); db.close();
    }, anchor.keys[0]);
    await page.evaluate(() => { window.releaseMeterDigest(); });
    await panel.getByText('Meter-key association not proven.', { exact: true }).waitFor();
    assert.equal(await meter.count(), 0);
    await page.evaluate(() => { crypto.subtle.digest = window.meterOriginalDigest; delete window.meterOriginalDigest; });
    // Restore authorization only through the real explicit user controls.
    await panel.locator('.sessionPOIDetails > summary').click();
    await panel.getByRole('button', { name: 'Inspect supplied TrustAnchor …', exact: true }).click();
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await preview.locator('.trustAnchorLoadedData').waitFor();
    const revoked = preview.locator('.anchorKeyTrustKey[data-key-id="' + anchor.keys[0] + '"]');
    await revoked.locator('[data-action=accept-key]').click();
    await revoked.locator('[data-action=confirm-key]').click();
    await revoked.locator('[data-key-trust=manual]').waitFor();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await panel.locator('.sessionMeterKeyResult[data-check=verified]').waitFor();
    // Original attestations really expire; fixture/demo mode cannot bypass the verifier clock.
    await page.clock.setFixedTime(new Date(Date.parse(metadata.generatedAt) + 25 * 3600000));
    await drop(fixtures.session); await panel.locator('.poiStationFailure').waitFor({ state: 'attached' });
    assert.equal(await verdict.count(), 0);
    assert.equal(await page.locator('webpack-dev-server-client-overlay').count(), 0);
    assert.deepEqual(failures, []);
    await writeFile(path.join(output, 'capture-info.json'), JSON.stringify({
        command: 'npm run docs:screenshots:poi-session', locale: 'en-US', timezone: 'UTC', viewport,
        mobileViewport: { width: 390, height: 844 }, fixedTime, browser: browser.version(), screenshots: imageNames,
        fixtures: Object.fromEntries(Object.entries(fixturePaths).map(([key, file]) =>
            [key, { path: file, sha256: createHash('sha256').update(fixtures[key]).digest('hex') }])),
        checks: ['real Drag & Drop', 'two genuine OCMF signatures', 'signed-reading detail dialog', 'proven-key details show individual reading results', 'no self-authorized trust', 'offline explicit bootstrap import',
            'manual authorization of two holders', 'genuine pruned EVSE proof', 'static tariff inclusion', 'locked EVSE',
            'explicit fresh retrieval', 'reload/file selection', 'tampered proof', 'wrong EVSE', 'tampered end reading', 'authoritative POI key handoff', 'container-key conflict', 'foreign proven key', 'wrong meter', 'ambiguous keys', 'export preserves conflicting original key', 'trust withdrawal during actual crypto work', 'expiry', 'no console errors'],
        scope: 'Session-bound station verification and explicit P-256 POI-to-Core key handoff. Current association and original-signature validity are separate from unproven historical association.'
    }, null, 2) + '\n');
    console.log(`Captured ${imageNames.length} session screenshots and passed genuine Drag & Drop browser checks in ${output}`);
    await context.close();
}
finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
