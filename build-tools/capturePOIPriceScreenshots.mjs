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
    'output-dir': { type: 'string', default: path.join(repo, 'documentation/screenshots/poi-prices') }
} });
const build = path.resolve(values['build-dir']);
const output = path.resolve(values['output-dir']);
const fixturePaths = { session: 'tests/fixtures/POIPrices/session-with-price.chargy',
    provenance: 'tests/fixtures/POIPrices/provenance.json' };
const fixtures = Object.fromEntries(await Promise.all(Object.entries(fixturePaths).map(async ([key, file]) =>
    [key, await readFile(path.join(repo, file), 'utf8')])));
const input = parseJSON(fixtures.session);
const metadata = JSON.parse(fixtures.provenance);
const anchor = TrustAnchor.parse(input.poiEvidence.bootstrap.trustAnchor);
const viewport = { width: 1440, height: 1050 };
const fixedTime = metadata.evaluatedAt;
const imageNames = ['01-before-trust.png','02-price-verified.png','03-pqc-details.png','04-mobile.png','05-signed-rate-conflict.png','06-publication-pending.png'];
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
    let priceRequests = 0;
    let serveArray = false;
    await context.addInitScript(() => { window.NativeFile = window.File; });
    await context.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if (url.href === anchor.urls[0] + '/keyStatement') { statementRequests++; return route.abort(); }
        if (url.href === anchor.urls[0] + '/EVSEs/' + metadata.evseId + '/proof') {
            proofRequests++;
            return route.fulfill({ body: prettyJSON(input.poiEvidence.chargingStationProof), contentType: 'application/json' });
        }
        if(url.href===anchor.urls[0]+'/EVSEs/'+metadata.evseId+'/priceStatements') {
            priceRequests++;
            const evidence=input.poiEvidence.priceEvidence;
            return route.fulfill({body:prettyJSON(serveArray?evidence.priceStatements:evidence),contentType:'application/json'});
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
    const main=fixtures.session;
    const panel=page.locator('.sessionPOI'),price=page.locator('.sessionPriceResult');
    const readFixture=name=>readFile(path.join(repo,'tests/fixtures/POIPrices',name+'.chargy'),'utf8');
    async function drop(text) { await resetObservedPOIHistory(page);
        const previous=await page.$('.sessionPOI');
        await page.evaluate(text=>{
            const transfer=new DataTransfer();transfer.items.add(new window.NativeFile([text],'price-session.chargy',{type:'application/json'}));
            document.querySelector('#startPage').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
        },text);await openMobileSession(page);
        if(previous!==null){await page.waitForFunction(element=>!element.isConnected,previous);await previous.dispose();}
        await panel.waitFor();
    }
    async function authorize() {
        await panel.locator('button').filter({hasText:'Inspect supplied TrustAnchor …'}).waitFor({state:'attached'});
        const controls=panel.locator('.sessionPOIDetails');
        if(!await controls.evaluate(element=>element.open))await controls.locator(':scope > summary').click();
        await panel.getByRole('button',{name:'Inspect supplied TrustAnchor …',exact:true}).click();
        const dialog=page.locator('#qrCodeScanner'),preview=dialog.locator('#qrCodeScannerTrustAnchorPreview');
        await dialog.getByRole('button',{name:'Import',exact:true}).click();await preview.locator('.trustAnchorLoadedData').waitFor();
        for(const id of anchor.keys){
            const key=preview.locator('.anchorKeyTrustKey[data-key-id="'+id+'"]');
            if(await key.locator('[data-key-trust=manual]').count())continue;
            await key.locator('[data-action=accept-key]').click();await key.locator('[data-action=confirm-key]').click();
            await key.locator('[data-key-trust=manual]').waitFor();
        }
        await dialog.getByRole('button',{name:'Close',exact:true}).click();
        await page.locator('.sessionPriceResult[data-state=valid]').waitFor();
    }
    async function settled(state) {
        await page.locator('.sessionPriceResult[data-state='+state+']').waitFor();
        assert.equal(await price.count(),1);
    }
    async function archives(){
        await page.locator('#settingsButton').click();await page.locator('#settingsTrustManagementEntry').click();
        await page.locator('#settingsTrustManagement').getByRole('button',{name:'Session evidence',exact:true}).click();
    }
    await drop(main);
    await panel.getByRole('button',{name:'Inspect supplied TrustAnchor …',exact:true}).waitFor();
    assert.equal(await page.locator('.sessionPriceResult[data-state=valid]').count(),0);
    assert.equal(priceRequests,0);await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(output,imageNames[0]),animations:'disabled',scale:'css'});
    await authorize();
    await page.locator('.historicalSessionResult[data-state=valid]').waitFor();
    assert.match(await price.textContent(),/CPO price signatures and key permissions valid/);
    assert.match(await price.textContent(),/Original start reading verified/);
    assert.match(await price.textContent(),/Gross rates and currency match/);
    assert.match(await price.textContent(),/Still not proven: publication before charging, customer consent/);
    const detailsViewport={width:1440,height:1900};
    async function capturePrice(index){await page.setViewportSize(detailsViewport);await price.scrollIntoViewIfNeeded();await price.screenshot({path:path.join(output,imageNames[index]),animations:'disabled',scale:'css'});await page.setViewportSize(viewport);}
    await capturePrice(1);
    await drop(await readFixture('pqc-price'));await settled('valid');
    await price.locator(':scope > details > summary').click();assert.match(await price.textContent(),/ML-DSA-65/);
    await capturePrice(2);
    await drop(main);await settled('valid');await page.setViewportSize({width:390,height:844});
    await price.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(output,imageNames[3]),animations:'disabled',scale:'css'});
    await price.locator(':scope > details > summary').click();assert.ok(await price.evaluate(element=>element.scrollWidth<=element.clientWidth));
    await page.setViewportSize(viewport);
    for(const [name,state,applicability,publication] of [
        ['decimal-price','valid','bound','valid'],['empty-prices','warning','missing','missing'],
        ['missing-agreement','warning','unbound','valid'],['invalid-signature','invalid','invalid','missing'],
        ['wrong-evse','invalid','invalid','missing'],['expired-price','warning','missing','missing'],
        ['foreign-tariff','invalid','invalid','missing'],['unauthorized-key','invalid','invalid','missing'],
        ['wrong-session','invalid','invalid','missing'],['contract-mode','warning','unsupported','valid'],
        ['variable-binding','warning','unsupported','valid'],['split-price-chain','invalid','invalid','missing'],
        ['broken-price-chain','invalid','invalid','missing'],['ambiguous-offers','warning','ambiguous','missing'],
        ['conditional-price','warning','unsupported','valid'],['tampered-publication','invalid','bound','invalid'],
        ['checkpoint-fork','invalid','bound','invalid'],['signed-rate-conflict','invalid','bound','valid'],
        ['missing-publication','warning','bound','missing']
    ]){
        await drop(await readFixture(name));await settled(state);
        assert.equal(await price.getAttribute('data-applicability'),applicability,name);
        assert.equal(await price.getAttribute('data-publication'),publication,name);
        if(name==='decimal-price')assert.match(await price.textContent(),/0\.3500 EUR\/kWh/);
        if(name==='signed-rate-conflict')await capturePrice(4);
        if(name==='missing-publication')await capturePrice(5);
    }
    assert.equal(priceRequests,0); // Embedded prices are not silently replaced with today's prices.
    const withoutPrice=JSON.parse(main);delete withoutPrice.poiEvidence.priceEvidence;
    await drop(JSON.stringify(withoutPrice));await settled('idle');assert.equal(priceRequests,0);
    serveArray=true;
    await panel.locator('[data-action=load-prices]').click();await settled('warning');
    assert.equal(priceRequests,1);assert.equal(await price.getAttribute('data-applicability'),'unbound');
    assert.match(await price.textContent(),/actual price assignment not proven/);
    await panel.locator('[data-action=load-prices]').click();await settled('warning');assert.equal(priceRequests,1);
    // A full experimental envelope carries the explicit assignment and publication evidence too.
    await drop(JSON.stringify(withoutPrice));await settled('idle');serveArray=false;
    await panel.locator('[data-action=load-prices]').click();await settled('valid');assert.equal(priceRequests,2);
    await page.locator('.historicalSessionResult[data-state=valid] [data-action=save-evidence]').click();
    await page.getByText('Evidence archived',{exact:true}).waitFor();await archives();
    const card=page.locator('[data-archive-id]');await card.waitFor();
    const download=page.waitForEvent('download');await card.locator('[data-action=export-archive]').click();
    const exported=await readFile(await(await download).path(),'utf8'),reimport=JSON.parse(exported);
    assert.ok(reimport.poiEvidence.priceEvidence);assert.match(reimport.poiEvidence.archiveAudit,/priceEvidenceSource/);
    assert.match(reimport.poiEvidence.archiveAudit,/priceStatements/);
    assert.equal(JSON.parse(reimport.poiEvidence.priceEvidence).agreement.startDocumentSHA256,input.poiEvidence.priceEvidence.agreement.startDocumentSHA256);
    await card.locator('[data-action=open-archive]').click();await settled('valid');assert.equal(priceRequests,2);
    await page.reload({waitUntil:'networkidle'});await archives();await card.locator('[data-action=open-archive]').click();await settled('valid');
    const clean=await browser.newContext({viewport,locale:'en-US',timezoneId:'UTC',serviceWorkers:'block'});
    await clean.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.fulfill({body:'{}',contentType:'application/json'}));
    const other=await clean.newPage();await other.clock.setFixedTime(new Date(fixedTime));await other.goto(origin,{waitUntil:'networkidle'});
    await other.locator('#fileInput').setInputFiles({name:'exported.chargy',mimeType:'application/json',buffer:Buffer.from(exported)}); await openMobileSession(other);
    await other.locator('.sessionPOI').getByRole('button',{name:'Inspect supplied TrustAnchor …',exact:true}).waitFor();
    assert.equal(await other.locator('.sessionPriceResult[data-state=valid]').count(),0);await clean.close();
    // Hold real Core crypto, withdraw an authorized holder, then release the original computation.
    await page.evaluate(()=>{
        const original=crypto.subtle.digest.bind(crypto.subtle);window.priceOriginalDigest=original;window.priceDigestHeld=false;
        crypto.subtle.digest=async function(algorithm,data){
            const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
            let held=false;
            if(!window.priceDigestHeld&&new TextDecoder().decode(bytes).includes('"MS":"CHARGY-POI-METER-001"')&&document.querySelector('.sessionPriceResult[data-state=pending]')){
                held=true;window.priceDigestHeld=true;await new Promise(resolve=>{window.releasePriceDigest=resolve;});
            }
            const result=await original(algorithm,data);if(held)window.priceDigestCompleted=true;return result;
        };
        window.priceDelayedDigest=crypto.subtle.digest;
    });
    await drop(main);await page.waitForFunction(()=>window.priceDigestHeld===true);
    await page.evaluate(async id=>{
        const db=await new Promise(resolve=>{const r=indexedDB.open('ChargyTrustManagement');r.onsuccess=()=>resolve(r.result);});
        await new Promise((resolve,reject)=>{const tx=db.transaction('trustAnchors','readwrite'),store=tx.objectStore('trustAnchors'),r=store.getAll();
            r.onsuccess=()=>{for(const record of r.result)store.put({...record,trustedKeys:record.trustedKeys.filter(key=>key.id!==id)});};
            tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
    },anchor.keys[0]);
    await page.evaluate(()=>window.releasePriceDigest());await settled('invalid');
    await page.evaluate(()=>{crypto.subtle.digest=window.priceOriginalDigest;});await authorize();
    await page.evaluate(()=>{window.priceDigestHeld=false;window.priceDigestCompleted=false;crypto.subtle.digest=window.priceDelayedDigest;});
    await drop(main);await page.waitForFunction(()=>window.priceDigestHeld===true);
    const controls=panel.locator('.sessionPOIDetails');if(!await controls.evaluate(element=>element.open))await controls.locator(':scope > summary').click();
    await page.locator('#poiSessionPolicy').selectOption('');
    await page.evaluate(()=>window.releasePriceDigest());await page.waitForFunction(()=>window.priceDigestCompleted===true);
    assert.equal(await price.count(),0); // Cleared selection cancels pending work and removes all results.
    await page.evaluate(()=>{crypto.subtle.digest=window.priceOriginalDigest;});
    await drop(main);await settled('valid');
    // Deleting a local anchor retains the evidence, but both price and history lose authorization.
    await page.locator('#settingsButton').click();await page.locator('#settingsTrustManagementEntry').click();
    await page.locator('#settingsTrustManagement').getByRole('button',{name:'Trust Anchors',exact:true}).click();
    await page.locator('[data-anchor-id]').getByRole('button',{name:'Delete trust anchor',exact:true}).click();
    await archives();await card.locator('[data-action=open-archive]').click();
    await panel.getByRole('button',{name:'Inspect supplied TrustAnchor …',exact:true}).waitFor();
    assert.equal(await page.locator('.sessionPriceResult[data-state=valid]').count(),0);
    assert.equal(priceRequests,2);assert.equal(proofRequests,0);assert.equal(statementRequests,0);assert.deepEqual(failures,[]);
    await writeFile(path.join(output,'capture-info.json'),JSON.stringify({command:'npm run docs:screenshots:poi-prices',locale:'en-US',timezone:'UTC',viewport,
        mobileViewport:{width:390,height:844},detailsViewport,fixedTime,browser:browser.version(),screenshots:imageNames,
        fixture:{path:fixturePaths.session,sha256:createHash('sha256').update(main).digest('hex')},
        checks:['real Drag & Drop and explicit two-holder trust','Ed25519 and ML-DSA-65 CPO signatures','historically associated original start signature',
            'fixed-at-start price expires before end without rebinding','lossless 0.3500','all 21 signed fixtures','signature/assignment/rate/inclusion states separate',
            'no automatic price requests','array response remains unbound','explicit selected-anchor download','recheck does not refetch',
            'original network evidence archived/exported','reload and offline recheck','no trust restored from export',
            'withdrawal during real Core crypto','policy change cancels pending crypto','anchor deletion removes authorization and retains archive','no console errors'],
        scope:'Experimental CPO fixed-at-start ad-hoc assignment and gross-rate consistency; customer consent, pre-start publication and final billing remain unproven.'},null,2)+'\n');
    console.log('Captured '+imageNames.length+' price screenshots; signed fixtures, bounded retrieval, archive and trust checks passed.');
    await context.close();
}
finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
