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
    'output-dir': { type: 'string', default: path.join(repo, 'documentation/screenshots/poi-history') }
} });
const build = path.resolve(values['build-dir']);
const output = path.resolve(values['output-dir']);
const fixturePaths = { session: 'tests/fixtures/POIHistory/archived-session.chargy',
    provenance: 'tests/fixtures/POIHistory/provenance.json' };
const fixtures = Object.fromEntries(await Promise.all(Object.entries(fixturePaths).map(async ([key, file]) =>
    [key, await readFile(path.join(repo, file), 'utf8')])));
const input = parseJSON(fixtures.session);
const metadata = JSON.parse(fixtures.provenance);
const anchor = TrustAnchor.parse(input.poiEvidence.bootstrap.trustAnchor);
const viewport = { width: 1440, height: 1050 };
const fixedTime = metadata.evaluatedAt;
const imageNames = ['01-before-trust.png','02-historical-result.png','03-evidence-archive.png','04-mobile.png','05-missing-inclusion.png'];
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
    const main = await readFile(path.join(repo,'tests/fixtures/POIHistory/archived-session.chargy'),'utf8');
    async function drop(text) { await resetObservedPOIHistory(page);
        const previous = await page.$('.sessionPOI');
        await page.evaluate(text => {
            const transfer = new DataTransfer(); transfer.items.add(new window.NativeFile([text],'archived-session.chargy',{type:'application/json'}));
            document.querySelector('#startPage').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
        },text);await openMobileSession(page);
        if(previous!==null){await page.waitForFunction(element=>!element.isConnected,previous);await previous.dispose();}
    }
    const panel = page.locator('.sessionPOI'); const history = page.locator('.historicalSessionResult');
    const dialog = page.locator('#qrCodeScanner'); const preview = dialog.locator('#qrCodeScannerTrustAnchorPreview');
    async function authorize(expiredReference=false) {
        await panel.waitFor({state:'visible'});
        await panel.locator('button').filter({hasText:'Inspect supplied TrustAnchor …'}).waitFor({state:'attached'});
        const controls = panel.locator('.sessionPOIDetails');
        if (!await controls.evaluate(e=>e.open)) await controls.locator(':scope > summary').click();
        await panel.getByRole('button',{name:'Inspect supplied TrustAnchor …',exact:true}).click();
        await dialog.getByRole('button',{name:'Import',exact:true}).click(); await preview.locator('.trustAnchorLoadedData').waitFor();
        if(expiredReference){
            await preview.locator('[data-historical-reference=true]').waitFor();
            assert.equal(await preview.locator('[data-check=validity]').getAttribute('data-state'),'invalid');
        }
        for(const id of anchor.keys) {
            const key = preview.locator('.anchorKeyTrustKey[data-key-id="'+id+'"]');
            if(await key.locator('[data-key-trust=manual]').count()) continue;
            await key.locator('[data-action=accept-key]').click(); await key.locator('[data-action=confirm-key]').click();
            await key.locator('[data-key-trust=manual]').waitFor();
        }
        await dialog.getByRole('button',{name:'Close',exact:true}).click();
        await page.locator('.historicalSessionResult[data-state=valid]').waitFor();
    }
    async function enterArchives() {
        await page.locator('#settingsButton').click(); await page.locator('#settingsTrustManagementEntry').click();
        await page.locator('#settingsTrustManagement').getByRole('button',{name:'Session evidence',exact:true}).click();
    }
    await drop(main); await panel.getByRole('button',{name:'Inspect supplied TrustAnchor …',exact:true}).waitFor();
    assert.equal(await page.locator('.historicalSessionResult[data-state=valid]').count(),0);
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(output,imageNames[0]),animations:'disabled',scale:'css'});
    await authorize();
    assert.match(await history.textContent(),/RNO confirms association at the stated measurement times/);
    assert.match(await history.textContent(),/Station versions proven in RNO-signed checkpoints/);
    assert.match(await history.textContent(),/Independently authorized witness confirmation pending/);
    assert.match(await history.textContent(),/not independently proven/);
    const readSavedReference=async()=>page.evaluate(async()=>{
        const db=await new Promise(resolve=>{const r=indexedDB.open('ChargyTrustManagement');r.onsuccess=()=>resolve(r.result);});
        const records=await new Promise(resolve=>{const r=db.transaction('trustAnchors').objectStore('trustAnchors').getAll();r.onsuccess=()=>resolve(r.result);});
        db.close();return records[0].downloadedData.text;
    });
    const currentReference=await readSavedReference();
    await drop(await readFile(path.join(repo,'tests/fixtures/POIHistory/expired-bootstrap-session.chargy'),'utf8'));
    await page.locator('.historicalSessionResult[data-state=valid]').waitFor();await authorize(true);
    assert.equal(await readSavedReference(),currentReference);
    await drop(main);await page.locator('.historicalSessionResult[data-state=valid]').waitFor();
    await history.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,imageNames[1]),animations:'disabled',scale:'css'});
    // Details are backed by the newly reverified original documents, not archived green outcomes.
    await history.locator(':scope > details > summary').click();
    await history.locator(':scope > details > button').first().click();
    await page.locator('#cryptoDetailsPage #signatureCheck .fa-check-circle').waitFor();
    await mobileBack(page);
    await history.locator(':scope > details > summary').click();
    // A real storage error cannot show an archived-success state; retry writes actual IndexedDB.
    await page.evaluate(()=>{
        window.originalEvidencePut=IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put=function(...args){
            if(this.name==='sessions') throw new DOMException('Simulated evidence quota failure','QuotaExceededError');
            return window.originalEvidencePut.apply(this,args);
        };
    });
    await history.locator('[data-action=save-evidence]').click();
    await page.waitForFunction(()=>document.querySelector('.historicalSessionResult [data-action=save-evidence]')?.disabled===false);
    assert.equal(await history.getByText('Evidence archived',{exact:true}).count(),0);
    await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalEvidencePut;delete window.originalEvidencePut;});
    await history.locator('[data-action=save-evidence]').click(); await history.getByText('Evidence archived',{exact:true}).waitFor();
    assert.equal(await history.locator('[role=alert]').count(),0);
    await enterArchives();
    const card=page.locator('[data-archive-id]'); await card.waitFor(); assert.equal(await card.count(),1);
    await page.screenshot({path:path.join(output,imageNames[2]),animations:'disabled',scale:'css'});
    const download=page.waitForEvent('download'); await card.locator('[data-action=export-archive]').click();
    const exported=await readFile(await (await download).path(),'utf8');
    assert.ok(JSON.parse(exported).poiEvidence.historicalEvidence);
    assert.match(JSON.parse(exported).poiEvidence.archiveAudit,/audit-only; never restored as authorization/);
    await card.locator('[data-action=open-archive]').click(); await page.locator('.historicalSessionResult[data-state=valid]').waitFor();
    await page.setViewportSize({width:390,height:844}); await history.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(output,imageNames[3]),animations:'disabled',scale:'css'});
    await page.setViewportSize(viewport);
    await page.reload({waitUntil:'networkidle'}); await enterArchives(); await card.waitFor();
    await card.locator('[data-action=open-archive]').click(); await page.locator('.historicalSessionResult[data-state=valid]').waitFor();
    // Removing an anchor removes authorization, not the independently retained archival evidence.
    await page.locator('#settingsButton').click(); await page.locator('#settingsTrustManagementEntry').click();
    await page.locator('#settingsTrustManagement').getByRole('button',{name:'Trust Anchors',exact:true}).click();
    await page.locator('[data-anchor-id]').getByRole('button',{name:'Delete trust anchor',exact:true}).click();
    await enterArchives(); await card.waitFor(); await card.locator('[data-action=open-archive]').click();
    await panel.getByRole('button',{name:'Inspect supplied TrustAnchor …',exact:true}).waitFor();
    assert.equal(await page.locator('.historicalSessionResult[data-state=valid]').count(),0);
    await authorize();
    // A fresh browser context gets no authorization from the export or its old policy audit snapshot.
    const clean=await browser.newContext({viewport,locale:'en-US',timezoneId:'UTC',serviceWorkers:'block'});
    await clean.route('**/*',async route=>new URL(route.request().url()).origin===origin?route.continue():route.fulfill({body:'{}',contentType:'application/json'}));
    const other=await clean.newPage(); await other.clock.setFixedTime(new Date(fixedTime)); await other.goto(origin,{waitUntil:'networkidle'});
    await other.locator('#fileInput').setInputFiles({name:'exported.chargy',mimeType:'application/json',buffer:Buffer.from(exported)}); await openMobileSession(other);
    await other.locator('.sessionPOI').getByRole('button',{name:'Inspect supplied TrustAnchor …',exact:true}).waitFor();
    assert.equal(await other.locator('.historicalSessionResult[data-state=valid]').count(),0); await clean.close();
    for(const name of ['wrong-period','conflicting-assignments','tampered-checkpoint']) {
        await drop(await readFile(path.join(repo,'tests/fixtures/POIHistory',name+'.chargy'),'utf8'));
        await page.locator('.historicalSessionResult[data-state=invalid]').waitFor();
    }
    await drop(await readFile(path.join(repo,'tests/fixtures/POIHistory/missing-checkpoint.chargy'),'utf8'));
    await page.locator('.historicalSessionResult[data-state=warning]').waitFor();
    assert.match(await history.textContent(),/Original measurement signatures valid/);
    assert.match(await history.textContent(),/Checkpoint inclusion evidence pending/);
    await history.scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(output,imageNames[4]),animations:'disabled',scale:'css'});
    await drop(await readFile(path.join(repo,'tests/fixtures/POIHistory/key-rotation.chargy'),'utf8'));
    await page.locator('.historicalSessionResult[data-state=warning]').waitFor();
    assert.match(await history.textContent(),/Original measurement signatures valid/); assert.match(await history.textContent(),/Conflict/);
    await drop(main.replace('1011','1012')); await page.locator('.historicalSessionResult[data-state=warning]').waitFor();
    assert.match(await history.textContent(),/Historical association not proven for these original readings/);
    // Delay the real digest, withdraw one holder, then ensure the final current-policy read refuses success.
    await page.evaluate(()=>{
        const original=crypto.subtle.digest.bind(crypto.subtle); window.historyOriginalDigest=original;
        window.historyDigestHeld=false;
        crypto.subtle.digest=async function(algorithm,data){
            const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
            let held=false;
            if(!window.historyDigestHeld && new TextDecoder().decode(bytes).includes('"MS":"CHARGY-POI-METER-001"') && document.querySelector('.historicalSessionResult[data-state=pending]')) {
                held=true;window.historyDigestHeld=true; await new Promise(resolve=>{window.releaseHistoryDigest=resolve;});
            }
            const result=await original(algorithm,data);if(held)window.historyDigestCompleted=true;return result;
        };
        window.historyDelayedDigest=crypto.subtle.digest;
    });
    await drop(main); await page.waitForFunction(()=>window.historyDigestHeld===true);
    await page.evaluate(async id=>{
        const db=await new Promise(resolve=>{const r=indexedDB.open('ChargyTrustManagement');r.onsuccess=()=>resolve(r.result);});
        await new Promise((resolve,reject)=>{const tx=db.transaction('trustAnchors','readwrite');const store=tx.objectStore('trustAnchors');const r=store.getAll();
            r.onsuccess=()=>{for(const record of r.result)store.put({...record,trustedKeys:record.trustedKeys.filter(key=>key.id!==id)});};
            tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);}); db.close();
    },anchor.keys[0]);
    await page.evaluate(()=>window.releaseHistoryDigest()); await page.locator('.historicalSessionResult[data-state=invalid]').waitFor();
    await page.evaluate(()=>{crypto.subtle.digest=window.historyOriginalDigest;});
    await authorize();
    // Leaving the session during real asynchronous crypto cancels that panel and cannot write a stale success.
    await page.evaluate(()=>{window.historyDigestHeld=false;window.historyDigestCompleted=false;crypto.subtle.digest=window.historyDelayedDigest;});
    await drop(main);await page.waitForFunction(()=>window.historyDigestHeld===true);
    await enterArchives();await card.waitFor();
    await page.evaluate(()=>window.releaseHistoryDigest());await page.waitForFunction(()=>window.historyDigestCompleted===true);
    assert.equal(await page.locator('.historicalSessionResult[data-state=valid]').count(),0);
    await page.evaluate(()=>{crypto.subtle.digest=window.historyOriginalDigest;});
    await card.locator('[data-action=open-archive]').click();await page.locator('.historicalSessionResult[data-state=valid]').waitFor();
    await enterArchives(); await card.locator('[data-action=delete-archive]').click();
    await page.getByText('No evidence archived.',{exact:true}).waitFor();
    // An unknown expired bootstrap can also be inspected/imported as a historical reference without a live server.
    await page.locator('#settingsButton').click();await page.locator('#settingsTrustManagementEntry').click();
    await page.locator('#settingsTrustManagement').getByRole('button',{name:'Trust Anchors',exact:true}).click();
    await page.locator('[data-anchor-id]').getByRole('button',{name:'Delete trust anchor',exact:true}).click();
    const expiredBootstrap=await readFile(path.join(repo,'tests/fixtures/POIHistory/expired-bootstrap-session.chargy'),'utf8');
    await drop(expiredBootstrap);await authorize(true);
    await page.reload({waitUntil:'networkidle'});
    await page.locator('#fileInput').setInputFiles({name:'expired-bootstrap-session.chargy',mimeType:'application/json',buffer:Buffer.from(expiredBootstrap)}); await openMobileSession(page);
    await page.locator('.historicalSessionResult[data-state=valid]').waitFor();
    assert.equal(proofRequests,0);assert.equal(statementRequests,0);assert.deepEqual(failures,[]);
    await writeFile(path.join(output,'capture-info.json'),JSON.stringify({command:'npm run docs:screenshots:poi-history',locale:'en-US',timezone:'UTC',viewport,
        mobileViewport:{width:390,height:844},fixedTime,browser:browser.version(),screenshots:imageNames,
        fixture:{path:'tests/fixtures/POIHistory/archived-session.chargy',sha256:createHash('sha256').update(main).digest('hex')},
        checks:['real Drag & Drop','explicit two-holder authorization','expired historical documents','later checkpoint with different signing keys',
            'individual reading crypto details','unknown witness not authorized','quota failure/retry','actual IndexedDB archive','reload and recheck',
            'anchor deletion retains archive but removes authorization','export/reimport without trust restoration','wrong period','conflicting assignments',
            'tampered checkpoint','missing inclusion','two distinct historical meter keys','tampered original measurement','withdrawal during real crypto','navigation cancellation during real crypto','archive deletion','unknown expired bootstrap explicitly imported as historical reference','existing current reference not downgraded','no POI network requests','no console errors'],
        scope:'RNO association at signed measurement times and checkpoint inclusion; independent actual time, latest/sole state and witnessed publication are not asserted.'},null,2)+'\n');
    console.log('Captured '+imageNames.length+' historical screenshots; real archive, offline recheck and trust regressions passed.');
    await context.close();
}
finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
